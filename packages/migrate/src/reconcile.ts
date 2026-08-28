/**
 * The reconciliation. Contract §17.
 *
 * A migration is judged here and nowhere else. An importer that ran to
 * completion and produced no defensible count comparison has not migrated
 * anything; it has moved rows and lost the ability to prove it.
 *
 *     delta = target + quarantined + merged - source
 *
 * Per source system, entity and year — never as one aggregate, because a total
 * that matches while 2019 is short by 40 and 2023 is long by 40 is precisely
 * the failure an aggregate hides. Quarantine and dedup are the only two
 * mechanisms for accounting for a difference, and both leave a row behind, so a
 * non-zero delta is unexplained by construction.
 *
 * This lives in TypeScript rather than SQL because the three numbers do not all
 * live in the database: the source count comes from the extract manifest, taken
 * before anything transformed a row.
 */
import type { PaymentStatus, ReconciliationVerdict } from "@csa/domain";

import type { ExtractManifest } from "./read";
import { RULES } from "./rules";
import type { RuleName } from "./rules";

export interface ReconcileRow {
  readonly sourceSystem: string;
  readonly entity: string;
  readonly year: string;
  readonly source: number;
  readonly target: number;
  readonly quarantined: number;
  readonly merged: number;
  readonly delta: number;
  readonly verdict: "RECONCILES" | "UNEXPLAINED";
}

export interface FinancialFinding {
  readonly entity: string;
  readonly year: string;
  readonly status: string;
  readonly sourceRows: number;
  readonly targetRows: number;
  readonly sourceCents: number;
  readonly targetCents: number;
  readonly rowDelta: number;
  readonly centsDelta: number;
}

export interface ReconcileReport {
  readonly verdict: ReconciliationVerdict;
  readonly rows: readonly ReconcileRow[];
  readonly financial: readonly FinancialFinding[];
  /**
   * Quarantine buckets with no source count to compare against — a field-level
   * refusal rather than a row. Reported, never folded into a delta: a bucket
   * whose source side is zero by construction would read as an unexplained
   * surplus.
   */
  readonly unbucketed: readonly { entity: string; count: number }[];
  /** Why the comparison could not be made, when the verdict says so. */
  readonly notMeasurable: readonly string[];
  readonly sampling: SamplingRequirement;
}

/**
 * What the script cannot tell you.
 *
 * It compares numbers; it does not know whether the rows are correct. A green
 * run is a necessary condition and never a sufficient one, and reporting one as
 * a completed reconciliation is the specific dishonesty this type exists to
 * make awkward.
 */
export interface SamplingRequirement {
  readonly required: number;
  readonly performed: number;
  readonly satisfied: boolean;
  readonly note: string;
}

export interface CountObservation {
  readonly sourceSystem: string;
  readonly entity: string;
  readonly year: string;
  readonly count: number;
}

export interface AmountObservation {
  readonly entity: string;
  readonly year: string;
  readonly status: PaymentStatus;
  readonly rows: number;
  readonly cents: number;
}

export interface ReconcileInput {
  readonly manifest: ExtractManifest;
  readonly target: readonly CountObservation[];
  readonly quarantined: readonly CountObservation[];
  readonly merged: readonly CountObservation[];
  readonly targetAmounts: readonly AmountObservation[];
  /** How many records a human actually read, and the number the gate asks for. */
  readonly samplesPerformed?: number;
}

/**
 * How a source status folds into the contract's four.
 *
 * Declared here, applied to the source side of the financial comparison, and
 * printed in the report — so a reader can see that `expired` moved money out of
 * the collected bucket rather than having to infer it from a total that
 * happened to match.
 */
export const SOURCE_STATUS_MAPPING: Readonly<
  Record<string, { to: PaymentStatus; rule: RuleName }>
> = {
  paid: { to: "paid", rule: RULES.MOLLIE_STATUS_DIRECT },
  failed: { to: "failed", rule: RULES.MOLLIE_STATUS_DIRECT },
  refunded: { to: "refunded", rule: RULES.MOLLIE_STATUS_DIRECT },
  open: { to: "pending", rule: RULES.MOLLIE_OPEN_PENDING },
  expired: { to: "failed", rule: RULES.MOLLIE_EXPIRED_FAILED },
};

/** One record read by a human per 100 imported, and never fewer than 10. */
export function requiredSamples(totalImported: number): number {
  return Math.max(10, Math.ceil(totalImported / 100));
}

const bucket = (o: { sourceSystem: string; entity: string; year: string }) =>
  `${o.sourceSystem}|${o.entity}|${o.year}`;

function tally(observations: readonly CountObservation[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const o of observations) out.set(bucket(o), (out.get(bucket(o)) ?? 0) + o.count);
  return out;
}

export function reconcile(input: ReconcileInput): ReconcileReport {
  const notMeasurable: string[] = [];

  const source = new Map<string, number>();
  for (const file of input.manifest.files) {
    for (const [entity, years] of Object.entries(file.counts)) {
      for (const [year, count] of Object.entries(years)) {
        const k = `${file.sourceSystem}|${entity}|${year}`;
        source.set(k, (source.get(k) ?? 0) + count);
      }
    }
  }
  const noSourceSide = source.size === 0;
  if (noSourceSide) {
    notMeasurable.push(
      "the extract manifest carries no counts; there is no source side to compare",
    );
  }

  const target = tally(input.target);
  const quarantined = tally(input.quarantined);
  const merged = tally(input.merged);

  // A quarantine bucket with no source count is a field-level refusal, not a
  // row that went missing. Folding it into a delta would report a surplus that
  // never existed.
  const unbucketedCounts = new Map<string, number>();
  for (const [k, count] of quarantined) {
    if (!source.has(k)) {
      const entity = k.split("|")[1] ?? k;
      unbucketedCounts.set(entity, (unbucketedCounts.get(entity) ?? 0) + count);
    }
  }

  const rows: ReconcileRow[] = [];
  for (const [k, sourceCount] of [...source.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const [sourceSystem = "", entity = "", year = ""] = k.split("|");
    const t = target.get(k) ?? 0;
    const q = quarantined.get(k) ?? 0;
    const m = merged.get(k) ?? 0;
    const delta = t + q + m - sourceCount;
    rows.push({
      sourceSystem,
      entity,
      year,
      source: sourceCount,
      target: t,
      quarantined: q,
      merged: m,
      delta,
      verdict: delta === 0 ? "RECONCILES" : "UNEXPLAINED",
    });
  }

  // A target bucket with no source count means rows appeared from nowhere,
  // which is worse than rows going missing and must never be silent.
  //
  // Unless there is no source side at all: then nothing is known about these
  // rows, and calling them invented would dress an absent measurement up as a
  // finding.
  for (const [k, count] of target) {
    if (!noSourceSide && !source.has(k)) {
      const [sourceSystem = "", entity = "", year = ""] = k.split("|");
      rows.push({
        sourceSystem,
        entity,
        year,
        source: 0,
        target: count,
        quarantined: 0,
        merged: 0,
        delta: count,
        verdict: "UNEXPLAINED",
      });
    }
  }

  // -------------------------------------------------------------------------
  // The financial half — the one a row count cannot catch
  // -------------------------------------------------------------------------
  const sourceAmounts = new Map<string, { rows: number; cents: number }>();
  let sawAmounts = false;
  for (const file of input.manifest.files) {
    if (!file.amounts) continue;
    sawAmounts = true;
    for (const [sourceStatus, years] of Object.entries(file.amounts)) {
      const mapping = SOURCE_STATUS_MAPPING[sourceStatus];
      if (!mapping) {
        notMeasurable.push(
          `source status ${JSON.stringify(sourceStatus)} has no declared mapping; ` +
            "the financial comparison cannot be made without inventing one",
        );
        continue;
      }
      for (const [year, value] of Object.entries(years)) {
        const k = `payments|${year}|${mapping.to}`;
        const acc = sourceAmounts.get(k) ?? { rows: 0, cents: 0 };
        sourceAmounts.set(k, { rows: acc.rows + value.rows, cents: acc.cents + value.cents });
      }
    }
  }
  // Only a gap if the estate actually has money in it. An extract of people and
  // events carries no amounts because there are none, and reporting that as an
  // unmeasured financial comparison is a false alarm that teaches the reader to
  // ignore the real ones.
  const carriesMoney = input.manifest.files.some((f) => "payments" in f.counts);
  if (!sawAmounts && carriesMoney) {
    notMeasurable.push("no extract recorded amounts; the financial comparison was not made");
  }

  const targetAmounts = new Map<string, { rows: number; cents: number }>();
  for (const o of input.targetAmounts) {
    const k = `${o.entity}|${o.year}|${o.status}`;
    const acc = targetAmounts.get(k) ?? { rows: 0, cents: 0 };
    targetAmounts.set(k, { rows: acc.rows + o.rows, cents: acc.cents + o.cents });
  }

  const financial: FinancialFinding[] = [];
  for (const k of new Set([...sourceAmounts.keys(), ...targetAmounts.keys()])) {
    const [entity = "", year = "", status = ""] = k.split("|");
    const s = sourceAmounts.get(k) ?? { rows: 0, cents: 0 };
    const t = targetAmounts.get(k) ?? { rows: 0, cents: 0 };
    if (s.rows === t.rows && s.cents === t.cents) continue;
    financial.push({
      entity,
      year,
      status,
      sourceRows: s.rows,
      targetRows: t.rows,
      sourceCents: s.cents,
      targetCents: t.cents,
      rowDelta: t.rows - s.rows,
      centsDelta: t.cents - s.cents,
    });
  }
  financial.sort((a, b) => `${a.year}${a.status}`.localeCompare(`${b.year}${b.status}`));

  const totalImported = [...target.values()].reduce((a, b) => a + b, 0);
  const required = requiredSamples(totalImported);
  const performed = input.samplesPerformed ?? 0;
  const sampling: SamplingRequirement = {
    required,
    performed,
    satisfied: performed >= required,
    note:
      "A stated number of records read by a human, chosen across years and types and " +
      "including warning-flagged rows. A green comparison is a necessary condition and " +
      "never a sufficient one.",
  };

  let verdict: ReconciliationVerdict;
  if (rows.some((r) => r.verdict === "UNEXPLAINED") || financial.length > 0) {
    // A finding that WAS measurable outranks an input that was not. Otherwise a
    // missing financial extract would let an unexplained count delta report as
    // "not yet measurable", which is how a known defect gets filed as an
    // unknown one.
    verdict = "DOES_NOT_RECONCILE";
  } else if (notMeasurable.length > 0) {
    // Preferred over a confident answer from an incomplete run.
    verdict = "NOT_YET_MEASURABLE";
  } else if (!sampling.satisfied) {
    verdict = "NOT_YET_MEASURABLE";
    notMeasurable.push(
      `${performed} of ${required} required records were read by a human; the numbers ` +
        "agree but nobody has checked whether they are the right numbers",
    );
  } else {
    verdict = "RECONCILES";
  }

  return {
    verdict,
    rows,
    financial,
    unbucketed: [...unbucketedCounts.entries()].map(([entity, count]) => ({ entity, count })),
    notMeasurable,
    sampling,
  };
}
