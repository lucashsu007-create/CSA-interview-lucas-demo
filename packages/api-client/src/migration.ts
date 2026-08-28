/**
 * Contract §21 — the migration console's reads and its one write.
 *
 * Everything here runs under the caller's own session, so RLS decides what is
 * visible rather than the handler. That matters more than usual: a quarantine
 * payload holds whatever the legacy record contained, and the policies confine
 * these tables to `admin` — staff have no reason to read them, because the door
 * scanner does not migrate anything.
 *
 * Synthetic fixtures only. Nothing here reaches a CSA system.
 */
import type {
  ImportMode,
  ImportRunStatus,
  LegacySystem,
  PaymentStatus,
  QuarantineReason,
  QuarantineState,
  Uuid,
} from "@csa/domain";
import { toDate } from "@csa/validation";

import type { Sql } from "./db";

export interface ImportRunSummary {
  readonly id: Uuid;
  /** NULL for a run covering the whole estate, which is the normal case. */
  readonly sourceSystem: LegacySystem | null;
  readonly mode: ImportMode;
  readonly status: ImportRunStatus;
  readonly extractId: string;
  readonly extractSha256: string;
  readonly startedAt: Date;
  readonly finishedAt: Date | null;
  readonly acceptedCount: number;
  readonly warningCount: number;
  readonly rejectedCount: number;
  readonly quarantinedCount: number;
  readonly mergedCount: number;
}

export interface QuarantineItem {
  readonly id: Uuid;
  readonly importRunId: Uuid;
  readonly sourceSystem: LegacySystem;
  readonly sourceId: string;
  readonly entityType: string;
  readonly reason: QuarantineReason;
  readonly state: QuarantineState;
  readonly payload: Record<string, unknown>;
  readonly occurredYear: number | null;
  readonly paymentStatus: PaymentStatus | null;
  readonly amountCents: number | null;
  readonly resolvedByUserId: Uuid | null;
  readonly resolvedAt: Date | null;
  readonly resolutionNote: string | null;
  readonly createdAt: Date;
}

export interface MigrationOverview {
  readonly latestRun: ImportRunSummary | null;
  readonly openQuarantine: number;
  readonly resolvedQuarantine: number;
  /** Open records grouped by reason — the §17 rejection breakdown. */
  readonly byReason: ReadonlyArray<{ reason: QuarantineReason; count: number }>;
  readonly importedRows: ReadonlyArray<{ entity: string; count: number }>;
}

const runColumns = `
  r.id, r.source_system, r.mode, r.status, r.extract_id, r.extract_sha256,
  r.started_at, r.finished_at, r.accepted_count, r.warning_count, r.rejected_count,
  (select count(*) from quarantine_records q where q.import_run_id = r.id) as quarantined_count,
  (select count(*) from dedup_decisions d where d.import_run_id = r.id) as merged_count
`;

interface ImportRunRow {
  id: Uuid;
  source_system: LegacySystem | null;
  mode: ImportMode;
  status: ImportRunStatus;
  extract_id: string;
  extract_sha256: string;
  started_at: string;
  finished_at: string | null;
  accepted_count: number;
  warning_count: number;
  rejected_count: number;
  quarantined_count: string | number;
  merged_count: string | number;
}

function toRun(row: ImportRunRow): ImportRunSummary {
  return {
    id: row.id,
    sourceSystem: row.source_system,
    mode: row.mode,
    status: row.status,
    extractId: row.extract_id,
    extractSha256: row.extract_sha256,
    startedAt: toDate(row.started_at),
    finishedAt: row.finished_at === null ? null : toDate(row.finished_at),
    acceptedCount: Number(row.accepted_count),
    warningCount: Number(row.warning_count),
    rejectedCount: Number(row.rejected_count),
    // `count(*)` comes back as bigint, which the driver hands over as a string.
    // Number() here rather than at four call sites that would each forget.
    quarantinedCount: Number(row.quarantined_count),
    mergedCount: Number(row.merged_count),
  };
}

export async function listImportRuns(sql: Sql, limit = 20): Promise<ImportRunSummary[]> {
  const rows = await sql<ImportRunRow[]>`
    select ${sql.unsafe(runColumns)}
      from import_runs r
     order by r.started_at desc
     limit ${limit}
  `;
  return rows.map(toRun);
}

interface QuarantineRow {
  id: Uuid;
  import_run_id: Uuid;
  source_system: LegacySystem;
  source_id: string;
  entity_type: string;
  reason: QuarantineReason;
  state: QuarantineState;
  payload: Record<string, unknown>;
  occurred_year: number | null;
  payment_status: PaymentStatus | null;
  amount_cents: number | null;
  resolved_by_user_id: Uuid | null;
  resolved_at: string | null;
  resolution_note: string | null;
  created_at: string;
}

function toQuarantine(row: QuarantineRow): QuarantineItem {
  return {
    id: row.id,
    importRunId: row.import_run_id,
    sourceSystem: row.source_system,
    sourceId: row.source_id,
    entityType: row.entity_type,
    reason: row.reason,
    state: row.state,
    payload: row.payload ?? {},
    occurredYear: row.occurred_year,
    paymentStatus: row.payment_status,
    amountCents: row.amount_cents,
    resolvedByUserId: row.resolved_by_user_id,
    resolvedAt: row.resolved_at === null ? null : toDate(row.resolved_at),
    resolutionNote: row.resolution_note,
    createdAt: toDate(row.created_at),
  };
}

export async function listQuarantine(
  sql: Sql,
  options: { state?: QuarantineState; limit?: number } = {},
): Promise<QuarantineItem[]> {
  const limit = options.limit ?? 100;
  const rows = options.state
    ? await sql<QuarantineRow[]>`
        select * from quarantine_records
         where state = ${options.state}
         order by created_at desc, source_id
         limit ${limit}
      `
    : await sql<QuarantineRow[]>`
        select * from quarantine_records
         order by state, created_at desc, source_id
         limit ${limit}
      `;
  return rows.map(toQuarantine);
}

export interface ResolveQuarantineInput {
  readonly id: Uuid;
  readonly actorUserId: Uuid;
  readonly note: string;
  readonly state: Extract<QuarantineState, "resolved" | "discarded">;
}

export class QuarantineResolutionError extends Error {
  constructor(readonly token: "note_required" | "not_found" | "already_resolved") {
    super(token);
    this.name = "QuarantineResolutionError";
  }
}

/**
 * Closes one quarantined record, in the caller's own name.
 *
 * The audit row is written in the same transaction as the update. An override
 * recorded in one and not the other is worse than no audit trail at all,
 * because it looks like one — and the two writes are only atomic together if
 * nothing between them can commit on its own.
 */
export async function resolveQuarantineRecord(
  sql: Sql,
  input: ResolveQuarantineInput,
): Promise<QuarantineItem> {
  const note = input.note.trim();
  if (note === "") {
    // Checked here and again by a table CHECK. The gate requires a documented
    // reason for every rejection, and "resolved" with no account of how is the
    // exact failure it exists to prevent.
    throw new QuarantineResolutionError("note_required");
  }

  const [row] = await sql<QuarantineRow[]>`
    update quarantine_records
       set state = ${input.state},
           resolved_by_user_id = ${input.actorUserId},
           resolved_at = now(),
           resolution_note = ${note}
     where id = ${input.id}
       and state = 'open'
    returning *
  `;

  if (!row) {
    const [existing] = await sql<{ id: Uuid }[]>`
      select id from quarantine_records where id = ${input.id}
    `;
    throw new QuarantineResolutionError(existing ? "already_resolved" : "not_found");
  }

  await sql`
    insert into audit_events (actor_user_id, action, entity_type, entity_id, metadata)
    values (${input.actorUserId}, ${"quarantine." + input.state}, 'quarantine_records',
            ${input.id},
            ${sql.json({
              sourceSystem: row.source_system,
              sourceId: row.source_id,
              reason: row.reason,
              note,
            } as never)})
  `;

  return toQuarantine(row);
}

export async function migrationOverview(sql: Sql): Promise<MigrationOverview> {
  const [latest] = await sql<ImportRunRow[]>`
    select ${sql.unsafe(runColumns)} from import_runs r order by r.started_at desc limit 1
  `;

  const [states] = await sql<{ open: string; resolved: string }[]>`
    select count(*) filter (where state = 'open')      as open,
           count(*) filter (where state <> 'open')     as resolved
      from quarantine_records
  `;

  const byReason = await sql<{ reason: QuarantineReason; count: string }[]>`
    select reason, count(*) as count
      from quarantine_records
     where state = 'open'
     group by reason
     order by count(*) desc, reason
  `;

  // Only rows this platform imported. A count of every row would include the
  // seed, and a console that cannot tell imported rows from seeded ones is a
  // console that cannot answer the only question it exists for.
  const imported = await sql<{ entity: string; count: string }[]>`
      select 'users' as entity, count(*)::text as count from users where source_system is not null
    union all
      select 'membership_periods', count(*)::text from membership_periods where source_system is not null
    union all
      select 'events', count(*)::text from events where source_system is not null
    union all
      select 'registrations', count(*)::text from registrations where source_system is not null
  `;

  return {
    latestRun: latest ? toRun(latest) : null,
    openQuarantine: Number(states?.open ?? 0),
    resolvedQuarantine: Number(states?.resolved ?? 0),
    byReason: byReason.map((r) => ({ reason: r.reason, count: Number(r.count) })),
    importedRows: imported.map((r) => ({ entity: r.entity, count: Number(r.count) })),
  };
}
