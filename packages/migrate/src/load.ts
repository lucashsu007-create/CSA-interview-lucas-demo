/**
 * The load. Contract §18.
 *
 * Staging first, idempotent, and through the same validation boundary the
 * application uses — which here is proved rather than promised: after writing,
 * every entity is read back and parsed with the row schemas from
 * `@csa/validation`. An importer that writes rows the application cannot read
 * has not loaded anything usable, and only a read-back catches that.
 *
 * This package opens its own connection rather than going through
 * `@csa/api-client`. That package's surface is a session-scoped, mostly
 * read-only boundary for two running apps, and widening it with privileged
 * bulk writes so a terminal tool could reuse it would put a write path into
 * both apps that neither needs. The importer runs as the owner, from a shell,
 * once — and it is the one thing in the repo that legitimately does.
 */
import { RAW_TIMESTAMPS, parseConnectionString } from "@csa/api-client";
import type { ImportMode, LegacySystem } from "@csa/domain";
import {
  parseEventRows,
  parseMembershipPeriodRows,
  parsePaymentRows,
  parseRegistrationRows,
  parseUserRows,
} from "@csa/validation";
import postgres from "postgres";
import type { Sql } from "postgres";

import type { TransformResult } from "./drafts";
import type { RedirectMap } from "./redirects";

export interface LoadOptions {
  readonly databaseUrl: string;
  readonly mode: ImportMode;
  /**
   * The single source this run imported, or null for the whole estate.
   *
   * Null is the normal case. Deduplication is cross-source — the office ledger
   * matters precisely because its rows may be the same people as the MongoDB
   * ones — so a run that saw one system at a time could not resolve the
   * duplicates the harness exists for, and labelling a whole-estate import with
   * one system's name is simply untrue.
   */
  readonly sourceSystem: LegacySystem | null;
  readonly extractId: string;
  readonly extractSha256: string;
  readonly extractSchemaVersion: string;
  readonly extractCounts: unknown;
  readonly notes?: string;
  /** Written alongside the rows, when the caller built one. */
  readonly redirects?: RedirectMap;
}

export interface LoadResult {
  readonly importRunId: string;
  readonly mode: ImportMode;
  readonly written: Readonly<Record<string, number>>;
  readonly skippedAlreadyPresent: Readonly<Record<string, number>>;
  readonly readBack: Readonly<Record<string, number>>;
}

/**
 * Imported registrations need a ticket code and the legacy form never issued
 * one. The code is generated in the DATABASE by `generate_ticket_code()`:
 * contract §6 requires a CSPRNG, and a second implementation in TypeScript
 * would be a second thing to get wrong and a second thing to audit.
 */

export async function load(result: TransformResult, options: LoadOptions): Promise<LoadResult> {
  // libpq's `?host=/tmp` names a unix socket; the driver wants it as an option
  // rather than a query parameter, or the backend rejects `host` as an
  // unrecognised configuration parameter.
  const { url, host } = parseConnectionString(options.databaseUrl);
  // The same type map the apps' pool uses. `@csa/validation` parses the raw
  // timestamp text, so a pool that decodes to `Date` writes rows the
  // application cannot read — exactly what the read-back below exists to catch.
  const sql = postgres(url, {
    onnotice: () => {},
    types: RAW_TIMESTAMPS,
    ...(host ? { host } : {}),
  });
  try {
    return await sql.begin(async (tx) => runLoad(tx as unknown as Sql, result, options));
  } finally {
    await sql.end({ timeout: 5 });
  }
}

async function runLoad(
  sql: Sql,
  result: TransformResult,
  options: LoadOptions,
): Promise<LoadResult> {
  const dryRun = options.mode === "dry_run";

  const [run] = await sql<{ id: string }[]>`
    insert into import_runs
      (source_system, mode, status, extract_id, extract_sha256, extract_schema_version,
       extract_counts, accepted_count, warning_count, rejected_count, notes)
    values
      (${options.sourceSystem}, ${options.mode}, 'running', ${options.extractId},
       ${options.extractSha256}, ${options.extractSchemaVersion},
       ${sql.json(options.extractCounts as never)},
       ${result.records.filter((r) => r.disposition === "accepted").length},
       ${result.records.filter((r) => r.disposition === "warning").length},
       ${result.records.filter((r) => r.disposition === "rejected").length},
       ${options.notes ?? null})
    returning id
  `;
  const importRunId = run!.id;

  const written: Record<string, number> = {};
  const skipped: Record<string, number> = {};
  /**
   * `(source_system, source_id, entity_type)` → the target row it landed on.
   *
   * Populated from what the inserts actually returned, so a record's
   * `target_id` points at the row a reviewer would go and read. It stays empty
   * for a dry run, where there is no row to point at.
   */
  const targetIds = new Map<string, string>();
  const targetKey = (system: string, id: string, entity: string) => `${system}|${id}|${entity}`;

  /** Maps a normalised email to the user id it landed on, imported or already there. */
  const userIdByEmail = new Map<string, string>();

  if (!dryRun) {
    // ---------------------------------------------------------------------
    // Users
    // ---------------------------------------------------------------------
    for (const user of result.users) {
      // ON CONFLICT on the provenance key is the idempotency guarantee. A
      // second run of the same extract changes nothing, and the database is
      // what enforces that rather than a check in this loop.
      const rows = await sql<{ id: string }[]>`
        insert into users (email, full_name, role, source_system, source_id, import_run_id)
        values (${user.email}, ${user.fullName}, 'attendee',
                ${user.sourceSystem}, ${user.sourceId}, ${importRunId})
        on conflict (source_system, source_id) where source_system is not null
        do nothing
        returning id
      `;
      if (rows[0]) {
        written["users"] = (written["users"] ?? 0) + 1;
        targetIds.set(targetKey(user.sourceSystem, user.sourceId, "members"), rows[0].id);
      } else {
        skipped["users"] = (skipped["users"] ?? 0) + 1;
      }
    }

    for (const row of await sql<
      { id: string; email: string; source_system: string; source_id: string }[]
    >`
      select id, email::text as email, source_system::text as source_system, source_id
        from users where source_system is not null
    `) {
      userIdByEmail.set(row.email.toLowerCase(), row.id);
      // A re-run inserts nothing, so the map must be filled from what is
      // already there or every record on the second run would lose its target.
      targetIds.set(targetKey(row.source_system, row.source_id, "members"), row.id);
    }

    // ---------------------------------------------------------------------
    // Membership periods
    // ---------------------------------------------------------------------
    for (const period of result.memberships) {
      const userId = userIdByEmail.get(period.userEmail);
      if (!userId) {
        skipped["membership_periods"] = (skipped["membership_periods"] ?? 0) + 1;
        continue;
      }
      const rows = await sql<{ id: string }[]>`
        insert into membership_periods
          (user_id, member_number, membership_type, status, starts_at, expires_at,
           source_system, source_id, import_run_id)
        values (${userId}, ${period.memberNumber}, ${period.membershipType}, ${period.status},
                ${period.startsAt}, ${period.expiresAt},
                ${period.sourceSystem}, ${period.sourceId}, ${importRunId})
        on conflict (source_system, source_id) where source_system is not null
        do nothing
        returning id
      `;
      if (rows[0]) {
        written["membership_periods"] = (written["membership_periods"] ?? 0) + 1;
        targetIds.set(targetKey(period.sourceSystem, period.sourceId, "memberships"), rows[0].id);
      } else {
        skipped["membership_periods"] = (skipped["membership_periods"] ?? 0) + 1;
      }
    }

    // ---------------------------------------------------------------------
    // Events
    // ---------------------------------------------------------------------
    const eventIdBySourceId = new Map<string, string>();
    for (const event of result.events) {
      const rows = await sql<{ id: string }[]>`
        insert into events
          (title, description, category, location, starts_at, registration_deadline_at,
           capacity, price_member_cents, price_public_cents, status,
           source_system, source_id, import_run_id)
        values (${event.title}, ${event.description}, ${event.category}, ${event.location},
                ${event.startsAt}, ${event.registrationDeadlineAt}, ${event.capacity},
                ${event.priceMemberCents}, ${event.pricePublicCents}, ${event.status},
                ${event.sourceSystem}, ${event.sourceId}, ${importRunId})
        on conflict (source_system, source_id) where source_system is not null
        do nothing
        returning id
      `;
      if (rows[0]) {
        written["events"] = (written["events"] ?? 0) + 1;
        targetIds.set(targetKey(event.sourceSystem, event.sourceId, "events"), rows[0].id);
      } else {
        skipped["events"] = (skipped["events"] ?? 0) + 1;
      }
    }
    for (const row of await sql<{ id: string; source_id: string }[]>`
      select id, source_id from events where source_system = 'wordpress'
    `) {
      eventIdBySourceId.set(row.source_id, row.id);
      targetIds.set(targetKey("wordpress", row.source_id, "events"), row.id);
    }

    // ---------------------------------------------------------------------
    // Registrations
    // ---------------------------------------------------------------------
    for (const registration of result.registrations) {
      const eventId = eventIdBySourceId.get(registration.eventSourceId);
      const userId = userIdByEmail.get(registration.userEmail);
      if (!eventId || !userId) {
        skipped["registrations"] = (skipped["registrations"] ?? 0) + 1;
        continue;
      }
      // A historical registration is imported as already settled: the member
      // attended, and inventing a `pending` payment for a past event would put
      // rows in front of a committee that no one can act on.
      const rows = await sql<{ id: string }[]>`
        insert into registrations
          (event_id, user_id, ticket_code, price_paid_cents, is_member_price, payment_status,
           source_system, source_id, import_run_id)
        select ${eventId}, ${userId}, generate_ticket_code(),
               e.price_public_cents, false, 'paid',
               ${registration.sourceSystem}, ${registration.sourceId}, ${importRunId}
          from events e where e.id = ${eventId}
        on conflict do nothing
        returning id
      `;
      if (rows[0]) {
        written["registrations"] = (written["registrations"] ?? 0) + 1;
        targetIds.set(
          targetKey(registration.sourceSystem, registration.sourceId, "registrations"),
          rows[0].id,
        );
      } else {
        skipped["registrations"] = (skipped["registrations"] ?? 0) + 1;
      }
    }

    // ---------------------------------------------------------------------
    // Payments
    // ---------------------------------------------------------------------
    // Contract §4 puts payments against a registration, and these settle a
    // MEMBERSHIP. There is no membership payment table in this wave, so the
    // amounts stay in the quarantine and reporting layer rather than being
    // forced into a shape that would misattribute them to an event.
    skipped["payments"] = result.payments.length;

    // ---------------------------------------------------------------------
    // The redirect map
    // ---------------------------------------------------------------------
    // Upserted rather than inserted: a legacy URL's destination is a decision
    // that gets revised, and a second run should carry the revision rather
    // than silently keep the first answer.
    for (const rule of options.redirects?.rules ?? []) {
      await sql`
        insert into legacy_urls (legacy_url, target_path, redirect_status, source_system, note)
        values (${rule.legacyUrl}, ${rule.targetPath}, ${rule.redirectStatus},
                ${rule.sourceSystem}, ${rule.note})
        on conflict (legacy_url) do update
          set target_path = excluded.target_path,
              redirect_status = excluded.redirect_status,
              note = excluded.note
      `;
      written["legacy_urls"] = (written["legacy_urls"] ?? 0) + 1;
    }
  }

  // -------------------------------------------------------------------------
  // The audit trail — written in every mode, including dry_run
  // -------------------------------------------------------------------------
  // A dry run that reports nothing is a run nobody can review. The reports and
  // the quarantine set are the artefact of the transform stage, and they exist
  // whether or not a single target row was written.
  for (const record of result.records) {
    await sql`
      insert into import_records
        (import_run_id, source_system, source_id, entity_type, disposition, target_id,
         applied_rules, detail)
      values (${importRunId}, ${record.sourceSystem}, ${record.sourceId}, ${record.entityType},
              ${record.disposition},
              ${
                record.disposition === "rejected"
                  ? null
                  : (targetIds.get(
                      targetKey(record.sourceSystem, record.sourceId, record.entityType),
                    ) ?? null)
              },
              ${record.appliedRules as unknown as string[]}, ${record.detail ?? null})
      on conflict do nothing
    `;
  }

  for (const q of result.quarantine) {
    await sql`
      insert into quarantine_records
        (import_run_id, source_system, source_id, entity_type, reason, payload,
         occurred_year, payment_status, amount_cents)
      values (${importRunId}, ${q.sourceSystem}, ${q.sourceId}, ${q.entityType}, ${q.reason},
              ${sql.json(q.payload as never)},
              ${q.year === "unknown" ? null : Number(q.year)},
              ${q.paymentStatus ?? null}, ${q.amountCents ?? null})
      on conflict do nothing
    `;
  }

  for (const d of result.dedup) {
    await sql`
      insert into dedup_decisions
        (import_run_id, entity_type, rule, winner_source_system, winner_source_id,
         merged_source_system, merged_source_id)
      values (${importRunId}, ${d.entityType}, ${d.rule},
              ${d.winner.sourceSystem}, ${d.winner.sourceId},
              ${d.merged.sourceSystem}, ${d.merged.sourceId})
      on conflict do nothing
    `;
  }

  // -------------------------------------------------------------------------
  // Read back through the application's own schemas
  // -------------------------------------------------------------------------
  const readBack: Record<string, number> = {};
  if (!dryRun) {
    readBack["users"] = parseUserRows(
      await sql`select * from users where source_system is not null`,
    ).length;
    readBack["membership_periods"] = parseMembershipPeriodRows(
      await sql`select * from membership_periods where source_system is not null`,
    ).length;
    readBack["events"] = parseEventRows(
      await sql`select * from events where source_system is not null`,
    ).length;
    readBack["registrations"] = parseRegistrationRows(
      await sql`select * from registrations where source_system is not null`,
    ).length;
    readBack["payments"] = parsePaymentRows(
      await sql`select * from payments where source_system is not null`,
    ).length;
  }

  await sql`
    update import_runs
       set status = ${dryRun ? "succeeded" : "succeeded"}, finished_at = now()
     where id = ${importRunId}
  `;

  return {
    importRunId,
    mode: options.mode,
    written,
    skippedAlreadyPresent: skipped,
    readBack,
  };
}
