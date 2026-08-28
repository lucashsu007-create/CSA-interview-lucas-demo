/**
 * Counting a transform result the way the reconciliation needs it counted.
 *
 * In `dry_run` this is the whole target side: no rows were written, so the
 * drafts are what the target would contain. After a real load the same shapes
 * are read back from the database instead, and the two must agree — a load that
 * reconciles against its own drafts and not against the database has proved
 * only that the transform is self-consistent.
 */
import type { PaymentStatus } from "@csa/domain";

import type { TransformResult } from "./drafts";
import type { AmountObservation, CountObservation } from "./reconcile";

/** The entity name each draft list reconciles under, matching the manifest's. */
const ENTITY = {
  users: "members",
  memberships: "memberships",
  events: "events",
  registrations: "registrations",
  payments: "payments",
} as const;

function count(
  rows: ReadonlyArray<{ sourceSystem: string; year: string }>,
  entity: string,
): CountObservation[] {
  const out = new Map<string, CountObservation>();
  for (const row of rows) {
    const k = `${row.sourceSystem}|${row.year}`;
    const existing = out.get(k);
    if (existing) out.set(k, { ...existing, count: existing.count + 1 });
    else out.set(k, { sourceSystem: row.sourceSystem, entity, year: row.year, count: 1 });
  }
  return [...out.values()];
}

export function targetCounts(result: TransformResult): CountObservation[] {
  return [
    ...count(result.users, ENTITY.users),
    ...count(result.memberships, ENTITY.memberships),
    ...count(result.events, ENTITY.events),
    ...count(result.registrations, ENTITY.registrations),
    ...count(result.payments, ENTITY.payments),
  ];
}

export function quarantineCounts(result: TransformResult): CountObservation[] {
  const out = new Map<string, CountObservation>();
  for (const q of result.quarantine) {
    const k = `${q.sourceSystem}|${q.entityType}|${q.year}`;
    const existing = out.get(k);
    if (existing) out.set(k, { ...existing, count: existing.count + 1 });
    else
      out.set(k, {
        sourceSystem: q.sourceSystem,
        entity: q.entityType,
        year: q.year,
        count: 1,
      });
  }
  return [...out.values()];
}

/**
 * Merges are counted against the source system of the row that was merged AWAY,
 * not the winner's. The merged row is the one missing from the target, so it is
 * the one whose bucket needs the explanation.
 */
export function mergeCounts(result: TransformResult): CountObservation[] {
  const out = new Map<string, CountObservation>();
  for (const d of result.dedup) {
    const k = `${d.merged.sourceSystem}|${d.entityType}|${d.year}`;
    const existing = out.get(k);
    if (existing) out.set(k, { ...existing, count: existing.count + 1 });
    else
      out.set(k, {
        sourceSystem: d.merged.sourceSystem,
        entity: d.entityType,
        year: d.year,
        count: 1,
      });
  }
  return [...out.values()];
}

/**
 * The target's money, by status and year.
 *
 * Quarantined payments are included at their own status, because quarantine is
 * how a difference gets explained: a payment held back for review has not
 * vanished from the estate's finances, and leaving it out would report a
 * shortfall that a reader cannot account for.
 */
export function targetAmounts(result: TransformResult): AmountObservation[] {
  const out = new Map<string, AmountObservation>();
  const add = (year: string, status: PaymentStatus, cents: number) => {
    const k = `${year}|${status}`;
    const existing = out.get(k);
    if (existing)
      out.set(k, { ...existing, rows: existing.rows + 1, cents: existing.cents + cents });
    else out.set(k, { entity: "payments", year, status, rows: 1, cents });
  };

  for (const p of result.payments) add(p.year, p.status, p.amountCents);
  for (const q of result.quarantine) {
    if (q.entityType !== "payments" || !q.paymentStatus) continue;
    add(q.year, q.paymentStatus, q.amountCents ?? 0);
  }
  return [...out.values()];
}
