/**
 * Legacy extract → target drafts.
 *
 * A pure function, deliberately. Every decision the migration makes is taken
 * here, with no database in reach, which is what makes `dry_run` a real mode
 * and what makes the whole thing testable against the fixture's answer key
 * rather than against itself.
 *
 * The shape of the work is the same for every entity: normalise conservatively,
 * apply a named rule, and when the rules cannot resolve something, quarantine it
 * with a reason from the closed set. Nothing is guessed and nothing is dropped
 * silently.
 */
import type { EventCategory, MembershipStatus, PaymentStatus } from "@csa/domain";
import { isEventCategory } from "@csa/domain";
import type { LoadedExtract } from "./read";
import { normaliseEmail, parseLegacyDate, parseMoneyToCents } from "./normalise";
import { RULES } from "./rules";
import type { RuleName } from "./rules";
import { bucketYear } from "./drafts";
import type {
  DedupDraft,
  EventDraft,
  ImportRecordDraft,
  MembershipDraft,
  PaymentDraft,
  QuarantineDraft,
  RegistrationDraft,
  TransformResult,
  UserDraft,
} from "./drafts";

/**
 * Fields present in the sources that no target column exists for and no one
 * named a use for. Listed rather than ignored: the absence is a decision.
 */
const MINIMISED = [
  "mongodb.members.phone — no column in the target, and no named use. " +
    "The country of a bare national number is unresolvable anyway.",
  "mongodb.members.student_number — identifies a person at the university; " +
    "nothing in the platform needs it.",
  "mongodb.members.marketing_opt_in — a consent record cannot be migrated as a " +
    "boolean. Consent is re-collected, not inherited.",
  "office_ledger.handled_by — names a committee member, not a member. Kept out " +
    "of the target; it stays in the extract for an audit that needs it.",
  "google_forms.actives-recruitment — applications to join a committee are not " +
    "membership records and this wave imports none of them.",
] as const;

/** The default an event gets when the source recorded no capacity anywhere. */
const DEFAULT_CAPACITY = 60;
/** Registration closes this long before the event, when the source said nothing. */
const DEFAULT_DEADLINE_HOURS = 24;

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/** Mollie's vocabulary is wider than the contract's four statuses (§3). */
function mapMollieStatus(status: string): { value: PaymentStatus; rule: RuleName } | undefined {
  switch (status) {
    case "paid":
      return { value: "paid", rule: RULES.MOLLIE_STATUS_DIRECT };
    case "failed":
      return { value: "failed", rule: RULES.MOLLIE_STATUS_DIRECT };
    case "refunded":
      return { value: "refunded", rule: RULES.MOLLIE_STATUS_DIRECT };
    case "open":
      // Never completed and never failed. `pending` is the contract's word for it.
      return { value: "pending", rule: RULES.MOLLIE_OPEN_PENDING };
    case "expired":
      // The member started a payment and never finished it. That is a failure to
      // collect, and treating it as anything else overstates revenue.
      return { value: "failed", rule: RULES.MOLLIE_EXPIRED_FAILED };
    default:
      return undefined;
  }
}

export function transform(extract: LoadedExtract): TransformResult {
  const users: UserDraft[] = [];
  const memberships: MembershipDraft[] = [];
  const events: EventDraft[] = [];
  const registrations: RegistrationDraft[] = [];
  const payments: PaymentDraft[] = [];
  const records: ImportRecordDraft[] = [];
  const quarantine: QuarantineDraft[] = [];
  const dedup: DedupDraft[] = [];

  /** Normalised email → the source key that owns it. First writer wins. */
  const emailOwner = new Map<
    string,
    { sourceSystem: UserDraft["sourceSystem"]; sourceId: string }
  >();
  /** MongoDB oid → normalised email, so a membership can find its person. */
  const memberEmailByOid = new Map<string, string>();
  /** Lowercased full name → the MongoDB member with it, for the ambiguous case. */
  const mongoByName = new Map<string, { sourceId: string; email: string }>();

  // -------------------------------------------------------------------------
  // Members, from MongoDB
  // -------------------------------------------------------------------------
  for (const member of extract.members) {
    const sourceId = member._id.$oid;
    const year = bucketYear(member.created_at);
    const email = normaliseEmail(member.email);

    if (!email.ok) {
      quarantine.push({
        sourceSystem: "mongodb",
        sourceId,
        entityType: "members",
        reason: email.reason,
        payload: { name: member.name, created_at: member.created_at },
        year,
      });
      records.push({
        sourceSystem: "mongodb",
        sourceId,
        entityType: "members",
        disposition: "rejected",
        appliedRules: [],
        detail: email.detail,
        year,
      });
      continue;
    }

    memberEmailByOid.set(sourceId, email.value);
    mongoByName.set(member.name.trim().toLowerCase(), { sourceId, email: email.value });
    emailOwner.set(email.value, { sourceSystem: "mongodb", sourceId });

    // Everything the source knew about this person that the target does not
    // keep. The row still imports; the disposition records that it lost fields.
    const dropped = [
      member.phone ? "phone" : undefined,
      member.student_number ? "student_number" : undefined,
      member.marketing_opt_in !== undefined ? "marketing_opt_in" : undefined,
    ].filter((f): f is string => f !== undefined);

    users.push({
      sourceSystem: "mongodb",
      sourceId,
      email: email.value,
      fullName: member.name.trim(),
      year,
    });
    records.push({
      sourceSystem: "mongodb",
      sourceId,
      entityType: "members",
      disposition: dropped.length > 0 ? "warning" : "accepted",
      appliedRules: email.rules,
      detail: dropped.length > 0 ? `not carried into the target: ${dropped.join(", ")}` : undefined,
      year,
    });
  }

  // -------------------------------------------------------------------------
  // Members, from the office register
  // -------------------------------------------------------------------------
  for (const entry of extract.ledger) {
    const year = bucketYear(entry.date);
    const email = normaliseEmail(entry.email);

    if (!email.ok) {
      // A real payment and a real person, and nothing to key them on. There is
      // no rule that recovers this; a human with the paper can.
      quarantine.push({
        sourceSystem: "office_ledger",
        sourceId: entry.rowId,
        entityType: "members",
        reason: "missing_required_field",
        payload: { name: entry.name, date: entry.date, notes: entry.notes },
        year,
        ...(parseMoneyToCents(entry.amount).ok
          ? {
              paymentStatus: "paid" as PaymentStatus,
              amountCents: (parseMoneyToCents(entry.amount) as { value: number }).value,
            }
          : {}),
      });
      records.push({
        sourceSystem: "office_ledger",
        sourceId: entry.rowId,
        entityType: "members",
        disposition: "rejected",
        appliedRules: [],
        detail: email.detail,
        year,
      });
      continue;
    }

    const owner = emailOwner.get(email.value);
    if (owner) {
      // The approved rule resolves it: identical address after normalisation,
      // earliest record wins. Both sides are recorded, so the merge is as
      // accountable as a quarantine would have been.
      dedup.push({
        entityType: "members",
        rule: RULES.DEDUP_BY_EMAIL,
        winner: owner,
        merged: { sourceSystem: "office_ledger", sourceId: entry.rowId },
        year,
      });
      records.push({
        sourceSystem: "office_ledger",
        sourceId: entry.rowId,
        entityType: "members",
        disposition: "warning",
        appliedRules: [...email.rules, RULES.DEDUP_BY_EMAIL],
        detail: `merged into ${owner.sourceSystem}:${owner.sourceId} by ${RULES.DEDUP_BY_EMAIL}`,
        year,
      });
      continue;
    }

    const byName = mongoByName.get(entry.name.trim().toLowerCase());
    if (byName) {
      // Same name, different address. There is no approved rule for this and
      // there deliberately never will be: a name is not an identifier, and a
      // wrong merge deletes a person in a way nothing downstream can detect.
      quarantine.push({
        sourceSystem: "office_ledger",
        sourceId: entry.rowId,
        entityType: "members",
        reason: "ambiguous_duplicate",
        payload: {
          ledgerEmail: email.value,
          ledgerName: entry.name,
          candidate: { sourceSystem: "mongodb", sourceId: byName.sourceId, email: byName.email },
          note: "same name, different address. Merging on a name alone is not an approved rule.",
        },
        year,
      });
      records.push({
        sourceSystem: "office_ledger",
        sourceId: entry.rowId,
        entityType: "members",
        disposition: "rejected",
        appliedRules: email.rules,
        detail: `name matches mongodb:${byName.sourceId} but the address does not`,
        year,
      });
      continue;
    }

    emailOwner.set(email.value, { sourceSystem: "office_ledger", sourceId: entry.rowId });
    users.push({
      sourceSystem: "office_ledger",
      sourceId: entry.rowId,
      email: email.value,
      fullName: entry.name.trim(),
      year,
    });
    records.push({
      sourceSystem: "office_ledger",
      sourceId: entry.rowId,
      entityType: "members",
      disposition: "accepted",
      appliedRules: email.rules,
      year,
    });
  }

  // -------------------------------------------------------------------------
  // Membership periods
  // -------------------------------------------------------------------------
  for (const period of extract.memberships) {
    const sourceId = period._id.$oid;
    const year = bucketYear(period.start_date);
    const ownerEmail = memberEmailByOid.get(period.member_id.$oid);

    const reject = (
      reason: QuarantineDraft["reason"],
      detail: string,
      extra: Record<string, unknown> = {},
    ) => {
      quarantine.push({
        sourceSystem: "mongodb",
        sourceId,
        entityType: "memberships",
        reason,
        payload: { ...period, ...extra },
        year,
        ...(parseMoneyToCents(period.amount).ok
          ? { amountCents: (parseMoneyToCents(period.amount) as { value: number }).value }
          : {}),
      });
      records.push({
        sourceSystem: "mongodb",
        sourceId,
        entityType: "memberships",
        disposition: "rejected",
        appliedRules: [],
        detail,
        year,
      });
    };

    if (!ownerEmail) {
      reject("orphaned_reference", `member_id ${period.member_id.$oid} is not an imported member`);
      continue;
    }

    const startsAt = parseLegacyDate(period.start_date);
    if (!startsAt.ok) {
      reject(startsAt.reason, startsAt.detail);
      continue;
    }
    const expiresAt = parseLegacyDate(period.end_date);
    if (!expiresAt.ok) {
      reject(expiresAt.reason, expiresAt.detail);
      continue;
    }
    if (expiresAt.value.getTime() <= startsAt.value.getTime()) {
      reject("conflicting_status", "the period ends on or before it starts");
      continue;
    }

    // The source asserts two contradictory facts: a status, and a pair of dates
    // that disagree with it. Deriving one from the other is a guess about
    // whether this person is entitled to member pricing today, and the
    // reconciliation standard is explicit that there is no acceptable sampling
    // rate for that question. So it goes to a human.
    const expired = expiresAt.value.getTime() < Date.UTC(2026, 7, 24);
    if (period.status === "active" && expired) {
      reject("conflicting_status", `status is active but the period ended ${period.end_date}`, {
        derivedStatusWouldBe: "expired",
      });
      continue;
    }

    const rules: RuleName[] = [...startsAt.rules, ...expiresAt.rules];
    const premium = period.type === "premium";
    if (premium) rules.push(RULES.PREMIUM_MAPPED);

    const status: MembershipStatus =
      period.status === "cancelled" ? "cancelled" : expired ? "expired" : "active";
    if (status !== period.status) rules.push(RULES.STATUS_DERIVED_FROM_PERIOD);

    memberships.push({
      sourceSystem: "mongodb",
      sourceId,
      userEmail: ownerEmail,
      /*
       * Derived from the source id, never from a counter.
       *
       * A run-local sequence looks fine on a first import and collides on the
       * very next one: the delta restarts at 1 and every number is already
       * taken. The cutover rehearsal is where that surfaced, which is exactly
       * what a rehearsal is for — it would otherwise have surfaced during the
       * freeze, with the legacy system already read-only.
       *
       * Deriving it from `(source_system, source_id)` makes it stable across
       * runs and unique by the same key the whole importer is keyed on.
       * Contract §9.1 stays open: the number is per period rather than per
       * person, so a renewing member does not keep theirs. The importer cannot
       * fix that from here and must not pretend to — the real scheme is CSA's
       * to decide, and inventing a pretty one here would bury the question.
       */
      memberNumber: `CSA-M${sourceId.toUpperCase()}`,
      membershipType: "general",
      status,
      startsAt: startsAt.value,
      expiresAt: expiresAt.value,
      year,
    });
    records.push({
      sourceSystem: "mongodb",
      sourceId,
      entityType: "memberships",
      disposition: premium || status !== period.status ? "warning" : "accepted",
      appliedRules: rules,
      detail: premium
        ? "premium bundles a language course; the target models memberships only"
        : status !== period.status
          ? `status ${period.status} superseded by ${status}, derived from the period`
          : undefined,
      year,
    });
  }

  // -------------------------------------------------------------------------
  // Overlapping active periods
  // -------------------------------------------------------------------------
  // The target permits one active membership per person at a time and enforces
  // it with an exclusion constraint; MongoDB permitted anything. Two periods
  // flagged active over the same weeks is a contradiction the source never had
  // to resolve, and the importer must not resolve it either — picking one is a
  // guess about who is entitled to member pricing.
  //
  // Detected here rather than discovered at INSERT. A load that finds this by
  // hitting the constraint aborts halfway through a transaction with no
  // quarantine record and nothing to review, which is the difference between an
  // importer and a script.
  const activeByUser = new Map<string, MembershipDraft[]>();
  const overlapping = new Set<string>();
  for (const period of memberships) {
    if (period.status !== "active") continue;
    const existing = activeByUser.get(period.userEmail) ?? [];
    const clash = existing.find(
      (other) =>
        period.startsAt.getTime() < other.expiresAt.getTime() &&
        other.startsAt.getTime() < period.expiresAt.getTime(),
    );
    if (clash) {
      overlapping.add(period.sourceId);
      quarantine.push({
        sourceSystem: period.sourceSystem,
        sourceId: period.sourceId,
        entityType: "memberships",
        reason: "conflicting_status",
        payload: {
          userEmail: period.userEmail,
          overlaps: clash.sourceId,
          period: [period.startsAt.toISOString(), period.expiresAt.toISOString()],
          other: [clash.startsAt.toISOString(), clash.expiresAt.toISOString()],
          note: "two active periods over the same weeks; the target permits one",
        },
        year: period.year,
      });
      continue;
    }
    existing.push(period);
    activeByUser.set(period.userEmail, existing);
  }

  if (overlapping.size > 0) {
    for (let i = memberships.length - 1; i >= 0; i -= 1) {
      const period = memberships[i]!;
      if (!overlapping.has(period.sourceId)) continue;
      memberships.splice(i, 1);
      const recordIndex = records.findIndex(
        (r) => r.entityType === "memberships" && r.sourceId === period.sourceId,
      );
      if (recordIndex >= 0) {
        records[recordIndex] = {
          ...records[recordIndex]!,
          disposition: "rejected",
          detail: "an active period overlapping another active period for the same person",
        };
      }
    }
  }

  // -------------------------------------------------------------------------
  // Events, from WordPress
  // -------------------------------------------------------------------------
  const eventBySlug = new Map<string, string>();
  for (const item of extract.wordpress) {
    const sourceId = String(item.postId);
    const year = bucketYear(item.pubDate);
    const isEvent = item.postType === "csa_event";
    const entityType = isEvent ? "events" : "content";

    if (!isEvent) {
      // Page and post content has no target table in this wave. Recorded as out
      // of scope with a reason rather than dropped, so the count still balances
      // and the decision is visible.
      quarantine.push({
        sourceSystem: "wordpress",
        sourceId,
        entityType,
        reason: "out_of_scope",
        payload: { title: item.title, link: item.link, postType: item.postType },
        year,
      });
      records.push({
        sourceSystem: "wordpress",
        sourceId,
        entityType,
        disposition: "rejected",
        appliedRules: [],
        detail: "page content is not migrated in this wave; no target table exists",
        year,
      });
      continue;
    }

    if (!item.link.includes("csa-rotterdam.nl")) {
      // Another association's event, in the same WordPress install. Not CSA
      // Rotterdam's to migrate.
      quarantine.push({
        sourceSystem: "wordpress",
        sourceId,
        entityType,
        reason: "out_of_scope",
        payload: { title: item.title, link: item.link },
        year,
      });
      records.push({
        sourceSystem: "wordpress",
        sourceId,
        entityType,
        disposition: "rejected",
        appliedRules: [],
        detail: `event on ${new URL(item.link).host}, a separate association`,
        year,
      });
      continue;
    }

    const startsAt = parseLegacyDate(item.postmeta["_event_date"]);
    if (!startsAt.ok) {
      quarantine.push({
        sourceSystem: "wordpress",
        sourceId,
        entityType,
        reason: startsAt.reason,
        payload: { title: item.title, meta: item.postmeta },
        year,
      });
      records.push({
        sourceSystem: "wordpress",
        sourceId,
        entityType,
        disposition: "rejected",
        appliedRules: [],
        detail: startsAt.detail,
        year,
      });
      continue;
    }

    const rules: RuleName[] = [...startsAt.rules];
    const priceText = (item.postmeta["_event_price"] ?? "").trim();
    const free = /^(free|gratis|0)$/i.test(priceText);
    let cents = 0;
    if (!free) {
      const parsed = parseMoneyToCents(priceText);
      if (!parsed.ok) {
        quarantine.push({
          sourceSystem: "wordpress",
          sourceId,
          entityType,
          reason: parsed.reason,
          payload: { title: item.title, price: priceText },
          year,
        });
        records.push({
          sourceSystem: "wordpress",
          sourceId,
          entityType,
          disposition: "rejected",
          appliedRules: rules,
          detail: parsed.detail,
          year,
        });
        continue;
      }
      cents = parsed.value;
      rules.push(...parsed.rules);
    }

    // WordPress recorded one price. The target has a member price and a public
    // one, because resolving price from membership state server-side is the
    // whole point. There is nothing in the source to split it with, so both get
    // the same figure and the row is flagged for a human to price properly.
    rules.push(RULES.SINGLE_PRICE_APPLIED_TO_BOTH);
    // And it recorded no capacity at all — there is nowhere in WordPress that
    // one was ever stored, which is exactly why the current sign-up cannot sell
    // out. A default is invented and said out loud.
    rules.push(RULES.CAPACITY_DEFAULTED, RULES.DEADLINE_DERIVED);

    const category = item.postmeta["_event_category"];
    eventBySlug.set(item.slug, sourceId);
    events.push({
      sourceSystem: "wordpress",
      sourceId,
      title: item.title,
      description: item.content.replace(/<[^>]*>/g, "").trim(),
      category: (isEventCategory(category) ? category : "social") as EventCategory,
      location: item.postmeta["_event_location"] ?? "",
      startsAt: startsAt.value,
      registrationDeadlineAt: new Date(
        startsAt.value.getTime() - DEFAULT_DEADLINE_HOURS * 60 * 60 * 1000,
      ),
      capacity: DEFAULT_CAPACITY,
      priceMemberCents: cents,
      pricePublicCents: cents,
      status: item.status === "draft" ? "draft" : "published",
      year,
    });
    records.push({
      sourceSystem: "wordpress",
      sourceId,
      entityType,
      disposition: "warning",
      appliedRules: rules,
      detail:
        "capacity and deadline invented (absent in WordPress); one legacy price applied to " +
        "both the member and the public price",
      year,
    });
  }

  // -------------------------------------------------------------------------
  // Registrations, from the Google Form
  // -------------------------------------------------------------------------
  const seenRegistration = new Set<string>();
  for (const signup of extract.eventSignups) {
    const year = bucketYear(signup.timestamp);
    const email = normaliseEmail(signup.emailAddress);

    if (!email.ok) {
      quarantine.push({
        sourceSystem: "google_forms",
        sourceId: signup.rowId,
        entityType: "registrations",
        reason: email.reason,
        payload: { ...signup },
        year,
      });
      records.push({
        sourceSystem: "google_forms",
        sourceId: signup.rowId,
        entityType: "registrations",
        disposition: "rejected",
        appliedRules: [],
        detail: email.detail,
        year,
      });
      continue;
    }

    const eventSourceId = eventBySlug.get(slugify(signup.whichEvent));
    if (!eventSourceId || !emailOwner.has(email.value)) {
      // The form field is free text, so there was never any referential
      // integrity here to lose.
      quarantine.push({
        sourceSystem: "google_forms",
        sourceId: signup.rowId,
        entityType: "registrations",
        reason: "orphaned_reference",
        payload: { ...signup, resolvedEmail: email.value },
        year,
      });
      records.push({
        sourceSystem: "google_forms",
        sourceId: signup.rowId,
        entityType: "registrations",
        disposition: "rejected",
        appliedRules: email.rules,
        detail: eventSourceId
          ? `no imported member for ${email.value}`
          : `no event matches ${JSON.stringify(signup.whichEvent)}`,
        year,
      });
      continue;
    }

    // The target holds one registration per person per event. The form held no
    // such constraint, so a second sign-up is the same registration typed
    // twice, and it merges rather than quarantining.
    const key = `${eventSourceId}|${email.value}`;
    if (seenRegistration.has(key)) {
      dedup.push({
        entityType: "registrations",
        rule: RULES.DEDUP_BY_EMAIL,
        winner: { sourceSystem: "google_forms", sourceId: `${key}` },
        merged: { sourceSystem: "google_forms", sourceId: signup.rowId },
        year,
      });
      records.push({
        sourceSystem: "google_forms",
        sourceId: signup.rowId,
        entityType: "registrations",
        disposition: "warning",
        appliedRules: [...email.rules, RULES.DEDUP_BY_EMAIL],
        detail: "a second sign-up for the same event by the same person",
        year,
      });
      continue;
    }
    seenRegistration.add(key);

    registrations.push({
      sourceSystem: "google_forms",
      sourceId: signup.rowId,
      eventSourceId,
      userEmail: email.value,
      year,
    });
    records.push({
      sourceSystem: "google_forms",
      sourceId: signup.rowId,
      entityType: "registrations",
      disposition: "accepted",
      appliedRules: email.rules,
      year,
    });
  }

  // -------------------------------------------------------------------------
  // Committee applications, from the actives-recruitment form
  // -------------------------------------------------------------------------
  // None of these import: an application to join a committee is not a
  // membership record and this wave has no table for one. They are accounted
  // for rather than ignored, because the extract counted them — and an entity
  // the extract declared and the importer passed over in silence is exactly the
  // gap a reconciliation exists to surface.
  for (const application of extract.actives) {
    const year = bucketYear(application.timestamp);
    quarantine.push({
      sourceSystem: "google_forms",
      sourceId: application.rowId,
      entityType: "applications",
      reason: "out_of_scope",
      payload: { committee: application.whichEvent, timestamp: application.timestamp },
      year,
    });
    records.push({
      sourceSystem: "google_forms",
      sourceId: application.rowId,
      entityType: "applications",
      disposition: "rejected",
      appliedRules: [],
      detail: "a committee application is not a membership record; this wave imports none",
      year,
    });
  }

  // -------------------------------------------------------------------------
  // Payments, from Mollie
  // -------------------------------------------------------------------------
  const membershipBySourceId = new Set(memberships.map((m) => m.sourceId));
  const membershipRefs = new Map<string, string>();
  for (const period of extract.memberships) {
    if (period.payment_ref) membershipRefs.set(period.payment_ref, period._id.$oid);
  }

  for (const payment of extract.payments) {
    const year = bucketYear(payment.createdAt);
    const membershipSourceId = membershipRefs.get(payment.id);
    const amount = parseMoneyToCents(payment.amount);
    const mapped = mapMollieStatus(payment.status);

    const rejectPayment = (reason: QuarantineDraft["reason"], detail: string) => {
      quarantine.push({
        sourceSystem: "mollie",
        sourceId: payment.id,
        entityType: "payments",
        reason,
        payload: { ...payment },
        year,
        ...(mapped ? { paymentStatus: mapped.value } : {}),
        ...(amount.ok ? { amountCents: amount.value } : {}),
      });
      records.push({
        sourceSystem: "mollie",
        sourceId: payment.id,
        entityType: "payments",
        disposition: "rejected",
        appliedRules: [],
        detail,
        year,
      });
    };

    if (!membershipSourceId || !membershipBySourceId.has(membershipSourceId)) {
      rejectPayment(
        "orphaned_reference",
        membershipSourceId
          ? `settles membership ${membershipSourceId}, which did not import`
          : "references a membership absent from the extract",
      );
      continue;
    }
    if (!amount.ok) {
      rejectPayment(amount.reason, amount.detail);
      continue;
    }
    if (!mapped) {
      rejectPayment(
        "conflicting_status",
        `unmapped Mollie status ${JSON.stringify(payment.status)}`,
      );
      continue;
    }

    payments.push({
      sourceSystem: "mollie",
      sourceId: payment.id,
      membershipSourceId,
      amountCents: amount.value,
      status: mapped.value,
      year,
    });
    records.push({
      sourceSystem: "mollie",
      sourceId: payment.id,
      entityType: "payments",
      disposition: mapped.rule === RULES.MOLLIE_STATUS_DIRECT ? "accepted" : "warning",
      appliedRules: [...amount.rules, mapped.rule],
      detail:
        mapped.rule === RULES.MOLLIE_STATUS_DIRECT
          ? undefined
          : `Mollie status ${payment.status} has no direct equivalent; mapped to ${mapped.value}`,
      year,
    });
  }

  return {
    users,
    memberships,
    events,
    registrations,
    payments,
    records,
    quarantine,
    dedup,
    minimisedFields: MINIMISED,
  };
}
