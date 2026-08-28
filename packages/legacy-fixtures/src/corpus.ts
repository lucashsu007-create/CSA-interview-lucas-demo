/**
 * Builds the synthetic legacy estate.
 *
 * Every defect below is planted deliberately and recorded in `plantedDefects`,
 * so the importer can be judged on whether it quarantined exactly those rows —
 * not merely on whether it quarantined some. An importer that panics and
 * quarantines a third of the corpus passes a row count and fails that.
 *
 * The shape of the mess is taken from what CSA publishes about itself:
 *
 *   * Membership sign-up offers iDEAL and tells anyone who cannot pay that way
 *     to register at the office. Two intakes, one person, two spellings.
 *   * The membership site sells General and Premium, where Premium bundles a
 *     language course. The target schema models neither courses nor Premium.
 *   * Event pages carry a sign-up form and no visible capacity, deadline or
 *     member price — so the legacy event has no capacity to import.
 *   * Archive content runs back to 2013 across several brand domains.
 *
 * Fictional data only. Nothing here was read from a CSA system.
 */
import { Rng } from "./rng";
import { alternateEmail, messyEmail, person } from "./people";
import type {
  FormResponse,
  LedgerEntry,
  LegacyEstate,
  MolliePayment,
  MongoMember,
  MongoMembership,
  PlantedDefect,
  PlantedMerge,
  WpItem,
} from "./types";

export interface CorpusOptions {
  /** Same seed, same corpus, byte for byte. */
  readonly seed?: number;
  readonly memberCount?: number;
}

const DEFAULTS = { seed: 20260824, memberCount: 96 } as const;

/**
 * The instant the estate is "as of".
 *
 * Fixed rather than read from the clock, for the same reason the manifest's
 * timestamp is: a corpus whose active memberships depend on the day it was
 * generated cannot be reconciled against a count taken yesterday.
 */
const NOW_YEAR = 2026;
const NOW_MONTH = 8;
const NOW_DAY = 24;

/** Hex oid, deterministic, 24 chars like MongoDB's. */
function oid(prefix: string, n: number): string {
  return (prefix + n.toString(16).padStart(24 - prefix.length, "0")).slice(0, 24);
}

function iso(y: number, m: number, d: number): string {
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}T00:00:00Z`;
}

/** `dd-mm-yyyy`, the way the older records were typed. */
function dutch(y: number, m: number, d: number): string {
  return `${String(d).padStart(2, "0")}-${String(m).padStart(2, "0")}-${y}`;
}

const EVENT_TITLES: ReadonlyArray<readonly [string, string]> = [
  ["Cheers with Peers", "social"],
  ["Mandarin Table Night", "educational"],
  ["Dumpling Workshop", "cultural"],
  ["Ink Painting Afternoon", "cultural"],
  ["Career Days Kick-off", "career"],
  ["Inhouse Day", "career"],
  ["Give Fortune Get Fortune", "cultural"],
  ["Lustrum Gala", "social"],
  ["Badminton Tournament", "sports"],
  ["Study Trip Info Session", "educational"],
  ["China in Focus", "cultural"],
  ["New Year Dinner", "social"],
];

const VENUES = [
  "De Gele Kanarie, Rotterdam",
  "Room PT-068, Burgemeester Oudlaan 50",
  "Erasmus Paviljoen",
  "Theil Building CB-1",
  "",
];

export function buildEstate(options: CorpusOptions = {}): LegacyEstate {
  const seed = options.seed ?? DEFAULTS.seed;
  const memberCount = options.memberCount ?? DEFAULTS.memberCount;
  const rng = new Rng(seed);

  const members: MongoMember[] = [];
  const memberships: MongoMembership[] = [];
  const wordpress: WpItem[] = [];
  const eventSignups: FormResponse[] = [];
  const actives: FormResponse[] = [];
  const mollie: MolliePayment[] = [];
  const ledger: LedgerEntry[] = [];
  const defects: PlantedDefect[] = [];
  const merges: PlantedMerge[] = [];

  const plant = (d: PlantedDefect) => {
    defects.push(d);
  };

  // -------------------------------------------------------------------------
  // MongoDB: members
  // -------------------------------------------------------------------------
  for (let i = 0; i < memberCount; i += 1) {
    const p = person(i);
    const id = oid("6", i + 1);
    const joinYear = 2019 + (i % 7);
    const joinMonth = rng.int(1, 12);
    const joinDay = rng.int(1, 28);

    // Older records were typed by hand into a form with no validation.
    const olderRecord = joinYear <= 2021;

    // Defect: a handful of members have no usable email at all. Nothing can be
    // matched to them and nothing can be sent to them.
    if (i % 31 === 7) {
      members.push({
        _id: { $oid: id },
        email: "",
        name: p.fullName,
        created_at: olderRecord
          ? dutch(joinYear, joinMonth, joinDay)
          : iso(joinYear, joinMonth, joinDay),
      });
      plant({
        id: `missing-email-${i}`,
        sourceSystem: "mongodb",
        sourceId: id,
        entityType: "member",
        expectedReason: "missing_required_field",
        note: "member document has an empty email; identity cannot be established",
      });
      continue;
    }

    // Defect: a national phone number with no country column. `612345678` is a
    // Dutch mobile and also a valid subscriber number in a dozen other plans —
    // normalising it to E.164 requires a guess, so it must not be normalised.
    const ambiguousPhone = i % 23 === 5;
    if (ambiguousPhone) {
      plant({
        id: `unresolvable-country-${i}`,
        sourceSystem: "mongodb",
        sourceId: id,
        entityType: "member_phone",
        expectedReason: "unresolvable_country",
        note: "national phone number with no country; E.164 would require guessing",
      });
    }

    members.push({
      _id: { $oid: id },
      email: messyEmail(p, rng),
      name: p.fullName,
      ...(ambiguousPhone
        ? { phone: `6${rng.int(10000000, 99999999)}` }
        : rng.chance(0.5)
          ? { phone: `+316${rng.int(10000000, 99999999)}`, country: "NL" }
          : {}),
      ...(rng.chance(0.7) ? { student_number: `4${rng.int(100000, 999999)}` } : {}),
      created_at: olderRecord
        ? dutch(joinYear, joinMonth, joinDay)
        : iso(joinYear, joinMonth, joinDay),
      marketing_opt_in: rng.chance(0.4),
    });
  }

  // -------------------------------------------------------------------------
  // MongoDB: membership periods
  // -------------------------------------------------------------------------
  let membershipSeq = 0;
  for (const m of members) {
    if (m.email === "") continue; // no identity, no period
    const periods = rng.int(1, 2);
    // A renewal FOLLOWS the previous period; it does not run alongside it. It
    // starts on the exact day the previous one ended, which the target's
    // exclusion constraint permits because the range is half-open — carrying the
    // year alone is not enough, since a renewal in the right year can still
    // begin in an earlier month than the previous period ended.
    let start = { year: 2019 + (membershipSeq % 7), month: rng.int(1, 12), day: rng.int(1, 28) };
    for (let k = 0; k < periods; k += 1) {
      membershipSeq += 1;
      const id = oid("7", membershipSeq);
      // Defect: a renewal recorded as starting before the previous period ended,
      // both flagged active. The target permits one active membership at a time
      // and enforces it; MongoDB permitted anything, so this contradiction could
      // sit in the estate unnoticed for years.
      const overlapsPrevious = k > 0 && membershipSeq % 9 === 4;
      if (overlapsPrevious) start = { ...start, year: start.year - 2 };
      const startYear = start.year;
      const startMonth = start.month;
      const startDay = start.day;
      // CSA sells three-year general membership; premium bundles a course.
      const premium = rng.chance(0.22);
      // CSA sells a three-year membership, so the period runs from start to
      // start + 3.
      const endYear = startYear + 3;
      const endMonth = startMonth;
      const endDay = startDay;
      // The next period picks up exactly where this one leaves off.
      start = { year: endYear, month: endMonth, day: endDay };
      // Whether the period has actually run out, as of the fixture's "now".
      // Statuses are derived from this so that a status contradicting its dates
      // is a PLANTED defect rather than the corpus's normal state — otherwise
      // the importer is right to quarantine most of the estate and the answer
      // key means nothing.
      const endedBeforeNow =
        endYear < NOW_YEAR ||
        (endYear === NOW_YEAR &&
          (endMonth < NOW_MONTH || (endMonth === NOW_MONTH && endDay < NOW_DAY)));
      // Mollie transaction ids are opaque and unique. Deriving one from the oid
      // prefix produced the same string for every membership, which made every
      // payment look like the same payment — a fixture bug that would have
      // shown up as a reconciliation the importer could not possibly pass.
      const ref = rng.chance(0.85)
        ? `tr_${membershipSeq.toString(36).padStart(7, "0")}`
        : undefined;

      // Defect: a date nobody can parse. 31 February exists on no calendar, and
      // "onbekend" ("unknown") is what someone typed when they did not know.
      const badDate = membershipSeq % 37 === 11;
      // Defect: status says active, the period ended years ago. The status was
      // never a fact; it was a field someone forgot to update.
      const staleActive = membershipSeq % 11 === 3 && startYear <= 2021;
      // A stale flag is only a defect if the period really has ended.

      if (badDate) {
        plant({
          id: `unparseable-date-${membershipSeq}`,
          sourceSystem: "mongodb",
          sourceId: id,
          entityType: "membership",
          expectedReason: "unparseable_date",
          note: "start_date is not a date on any calendar",
        });
      }
      if (overlapsPrevious && !endedBeforeNow) {
        plant({
          id: `overlapping-active-${membershipSeq}`,
          sourceSystem: "mongodb",
          sourceId: id,
          entityType: "membership",
          expectedReason: "conflicting_status",
          note:
            "an active period overlapping the previous active one for the same person; " +
            "the target permits one at a time and choosing between them is a guess about " +
            "who is entitled to member pricing",
        });
      }
      if (staleActive && endedBeforeNow) {
        plant({
          id: `conflicting-status-${membershipSeq}`,
          sourceSystem: "mongodb",
          sourceId: id,
          entityType: "membership",
          expectedReason: "conflicting_status",
          note: `status=active but the period ended in ${endYear}`,
        });
      }

      memberships.push({
        _id: { $oid: id },
        member_id: m._id,
        type: premium ? "premium" : "general",
        status:
          staleActive && endedBeforeNow
            ? "active"
            : rng.chance(0.08)
              ? "cancelled"
              : endedBeforeNow
                ? "expired"
                : "active",
        start_date: badDate
          ? rng.chance(0.5)
            ? "31-02-2024"
            : "onbekend"
          : dutch(startYear, startMonth, startDay),
        end_date: dutch(endYear, endMonth, endDay),
        amount: premium ? "€ 45,00" : rng.chance(0.5) ? "15.00" : "€ 15,00",
        ...(ref ? { payment_ref: ref } : {}),
      });
    }
  }

  // -------------------------------------------------------------------------
  // WordPress: pages, the 2013-2026 archive, and the csa_event post type
  // -------------------------------------------------------------------------
  let postId = 100;
  const eventSlugs: string[] = [];

  for (const [title, slug] of [
    ["About CSA", "about"],
    ["Board 2026-2027", "board-2026-2027"],
    ["Contact", "contact"],
    ["CSA Partners", "csa-partners"],
    ["Language Courses", "language-courses"],
    ["Become a General Member", "general-membership"],
  ] as const) {
    postId += 1;
    wordpress.push({
      postId,
      postType: "page",
      title,
      slug,
      link: `https://csa-rotterdam.nl/${slug}/`,
      pubDate: iso(2024, 9, 1),
      status: "publish",
      content: `<!-- wp:paragraph --><p>Elementor section for ${title}.</p><!-- /wp:paragraph -->`,
      postmeta: { _elementor_edit_mode: "builder", _wp_page_template: "elementor_header_footer" },
    });
  }

  // Chapter content that belongs to a different association entirely. It is in
  // the same WordPress install and it is not CSA Rotterdam's to migrate.
  postId += 1;
  wordpress.push({
    postId,
    postType: "csa_event",
    title: "CSA Utrecht Introduction Drink",
    slug: "csa-utrecht-introduction-drink",
    link: "https://csa-utrecht.nl/events/csa-utrecht-introduction-drink/",
    pubDate: iso(2022, 3, 14),
    status: "publish",
    content: "<p>A separate chapter, with its own board and its own domain.</p>",
    postmeta: { _event_date: "2022-04-08", _event_location: "Utrecht", _event_price: "Free" },
  });
  plant({
    id: "out-of-scope-utrecht",
    sourceSystem: "wordpress",
    sourceId: String(postId),
    entityType: "event",
    expectedReason: "out_of_scope",
    note: "an event of the Utrecht chapter — a separate association, on its own domain",
  });

  for (let year = 2013; year <= 2026; year += 1) {
    const count = year >= 2022 ? 4 : 2;
    for (let k = 0; k < count; k += 1) {
      postId += 1;
      const [title, category] = EVENT_TITLES[(postId + year) % EVENT_TITLES.length] as [
        string,
        string,
      ];
      const month = rng.int(1, 12);
      const day = rng.int(1, 28);
      const slug = `${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${year}`;
      eventSlugs.push(slug);

      // The legacy event has no capacity and no deadline. There is nowhere in
      // WordPress that either was ever recorded, which is exactly why the
      // current sign-up cannot close and cannot sell out.
      const free = rng.chance(0.45);
      const priceText = free
        ? rng.chance(0.5)
          ? "Free"
          : "Gratis"
        : rng.chance(0.5)
          ? `€ ${rng.int(3, 25)},00`
          : String(rng.int(3, 25));

      wordpress.push({
        postId,
        postType: "csa_event",
        title: `${title} ${year}`,
        slug,
        link: `https://csa-rotterdam.nl/events/${slug}/`,
        pubDate: iso(year, month, Math.max(1, day - 14)),
        status: year === 2026 && k === 3 ? "draft" : "publish",
        content: `<p>Please fill in the form below to send in your application for ${title}.</p>`,
        postmeta: {
          _event_date:
            year <= 2019
              ? dutch(year, month, day)
              : `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
          _event_time: `${rng.int(17, 21)}:00`,
          _event_location: rng.pick(VENUES),
          _event_price: priceText,
          _event_category: category,
        },
      });
    }
  }

  // -------------------------------------------------------------------------
  // Google Forms: event sign-ups and actives recruitment
  // -------------------------------------------------------------------------
  const namedMembers = members.filter((m) => m.email !== "");
  for (let i = 0; i < 180; i += 1) {
    const m = rng.pick(namedMembers);
    const slug = rng.pick(eventSlugs);

    // Defect: the member typed an event name that matches nothing. The form has
    // a free-text field, so there is no referential integrity to lose — there
    // never was any.
    const orphan = i % 41 === 9;
    if (orphan) {
      plant({
        id: `orphan-signup-${i}`,
        sourceSystem: "google_forms",
        sourceId: `signup-${i}`,
        entityType: "registration",
        expectedReason: "orphaned_reference",
        note: "free-text event name matches no event in the WordPress export",
      });
    }

    eventSignups.push({
      rowId: `signup-${i}`,
      timestamp: `${rng.int(2022, 2026)}/${String(rng.int(1, 12)).padStart(2, "0")}/${String(rng.int(1, 28)).padStart(2, "0")} ${rng.int(9, 22)}:${String(rng.int(0, 59)).padStart(2, "0")}:00`,
      emailAddress: m.email,
      fullName: m.name,
      whichEvent: orphan ? "the dumpling one (I think?)" : (slug.replace(/-/g, " ") as string),
      memberAnswer: rng.chance(0.7) ? "Yes" : "Not sure",
    });
  }

  for (let i = 0; i < 24; i += 1) {
    const p = person(memberCount + i);
    actives.push({
      rowId: `actives-${i}`,
      timestamp: `2026/0${rng.int(4, 8)}/${String(rng.int(1, 28)).padStart(2, "0")} ${rng.int(9, 22)}:00:00`,
      emailAddress: p.email,
      fullName: p.fullName,
      whichEvent: rng.pick(["IT", "Marketing", "Career Events", "Social Events", "Partnership"]),
      memberAnswer: "Yes",
    });
  }

  // -------------------------------------------------------------------------
  // Mollie: the payment export
  // -------------------------------------------------------------------------
  for (const ms of memberships) {
    if (!ms.payment_ref) continue;
    const premium = ms.type === "premium";
    const cents = premium ? 4500 : 1500;

    // Mollie's vocabulary is wider than the contract's four statuses. `open` and
    // `expired` have no target value and must be derived, not assumed.
    const status = rng.chance(0.82)
      ? "paid"
      : rng.chance(0.4)
        ? "failed"
        : rng.chance(0.5)
          ? "expired"
          : rng.chance(0.5)
            ? "open"
            : "refunded";

    mollie.push({
      id: ms.payment_ref,
      status,
      amount: (cents / 100).toFixed(2),
      description: `CSA ${premium ? "Premium" : "General"} Membership ${ms._id.$oid}`,
      createdAt: iso(2019 + (mollie.length % 7), rng.int(1, 12), rng.int(1, 28)),
      method: "ideal",
    });
  }

  // Defect: payments referencing a membership that is not in the export. The
  // membership was deleted, or lives in a collection nobody mentioned.
  for (let i = 0; i < 6; i += 1) {
    const id = `tr_orphan${String(i).padStart(4, "0")}`;
    mollie.push({
      id,
      status: "paid",
      amount: "15.00",
      description: `CSA General Membership ${oid("f", 900 + i)}`,
      createdAt: iso(2023, 5, 4 + i),
      method: "ideal",
    });
    plant({
      id: `orphan-payment-${i}`,
      sourceSystem: "mollie",
      sourceId: id,
      entityType: "payment",
      expectedReason: "orphaned_reference",
      note: "payment references a membership id absent from the MongoDB export",
    });
  }

  // -------------------------------------------------------------------------
  // The office register — the intake with no software behind it
  // -------------------------------------------------------------------------
  const handlers = ["board/treasurer", "board/secretary", "desk"];
  for (let i = 0; i < 28; i += 1) {
    const alsoInMongo = i % 3 === 0;
    const p = person(alsoInMongo ? i * 2 : memberCount + 40 + i);
    const year = 2022 + (i % 5);
    const date = dutch(year, rng.int(1, 12), rng.int(1, 28));
    const rowId = `ledger-${year}-${String(i).padStart(3, "0")}`;

    if (alsoInMongo) {
      // Defect: the same human, typed again at the desk under a different
      // address. Names match; emails do not. Merging on a name alone is how a
      // migration silently deletes someone, so this must be quarantined.
      ledger.push({
        rowId,
        date,
        name: p.fullName,
        email: alternateEmail(p),
        amount: "15,00",
        handledBy: rng.pick(handlers),
        notes: "cash, could not pay by iDEAL",
      });
      plant({
        id: `ambiguous-duplicate-${i}`,
        sourceSystem: "office_ledger",
        sourceId: rowId,
        entityType: "member",
        expectedReason: "ambiguous_duplicate",
        note: "name matches a MongoDB member; email does not. Never merge on a name alone.",
      });
      continue;
    }

    // Defect: a line with no email whatsoever. It is a real payment and a real
    // person and there is nothing to key them on.
    const noEmail = i % 7 === 4;
    if (noEmail) {
      plant({
        id: `ledger-no-email-${i}`,
        sourceSystem: "office_ledger",
        sourceId: rowId,
        entityType: "member",
        expectedReason: "missing_required_field",
        note: "office register line has no email address",
      });
    }

    ledger.push({
      rowId,
      date,
      name: p.fullName,
      email: noEmail ? "" : p.email,
      amount: "15,00",
      handledBy: rng.pick(handlers),
      notes: noEmail ? "cash — contact details to follow" : "cash",
    });
  }

  // Six ledger lines the approved rule is expected to RESOLVE: the same address
  // as a MongoDB member, typed at the desk in a different case with stray
  // whitespace. These must merge, not quarantine — an importer that refuses
  // them is as wrong as one that guesses at the ambiguous ones.
  for (let i = 0; i < 6; i += 1) {
    const memberIndex = 1 + i * 5;
    const source = members[memberIndex];
    if (!source || source.email === "") continue;
    const p = person(memberIndex);
    const year = 2023 + (i % 3);
    const rowId = `ledger-${year}-9${String(i).padStart(2, "0")}`;

    ledger.push({
      rowId,
      date: dutch(year, rng.int(1, 12), rng.int(1, 28)),
      name: p.fullName,
      email: `  ${p.email.toUpperCase()} `,
      amount: "15,00",
      handledBy: rng.pick(handlers),
      notes: "cash, already a member online",
    });
    merges.push({
      id: `resolvable-duplicate-${i}`,
      winnerSourceSystem: "mongodb",
      winnerSourceId: source._id.$oid,
      mergedSourceSystem: "office_ledger",
      mergedSourceId: rowId,
      note: "same address as a MongoDB member once normalised; the approved rule resolves it",
    });
  }

  return {
    mongo: { members, memberships },
    wordpress,
    forms: { eventSignups, actives },
    mollie,
    ledger,
    plantedDefects: defects,
    plantedMerges: merges,
  };
}
