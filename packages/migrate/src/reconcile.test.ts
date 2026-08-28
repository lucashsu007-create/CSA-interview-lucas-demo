import { describe, expect, it } from "vitest";

import { reconcile, requiredSamples } from "./reconcile";
import type { AmountObservation, CountObservation, ReconcileInput } from "./reconcile";
import type { ExtractManifest } from "./read";

/**
 * The reconciliation is the claim the whole harness rests on, so these tests
 * are mostly about the failures it must NOT miss. A comparison that always
 * reports green is worse than none: it converts an unexamined import into a
 * documented one.
 */
const manifest = (
  counts: Record<string, Record<string, number>>,
  amounts?: unknown,
): ExtractManifest => ({
  extractId: "2026-08-24T09:00:00Z/test",
  extractedAt: "2026-08-24T09:00:00Z",
  files: [
    {
      path: "mongodb/members.jsonl",
      sourceSystem: "mongodb",
      sha256: "0".repeat(64),
      bytes: 1,
      schemaVersion: "v1",
      counts,
      ...(amounts ? { amounts: amounts as never } : {}),
    },
  ],
});

const base = (over: Partial<ReconcileInput> = {}): ReconcileInput => ({
  manifest: manifest({ members: { "2024": 10 } }),
  target: [{ sourceSystem: "mongodb", entity: "members", year: "2024", count: 10 }],
  quarantined: [],
  merged: [],
  targetAmounts: [],
  samplesPerformed: 100,
  ...over,
});

describe("the count comparison", () => {
  it("reconciles when quarantine and merges account for the difference", () => {
    const report = reconcile(
      base({
        manifest: manifest({ members: { "2024": 10 } }),
        target: [{ sourceSystem: "mongodb", entity: "members", year: "2024", count: 7 }],
        quarantined: [{ sourceSystem: "mongodb", entity: "members", year: "2024", count: 2 }],
        merged: [{ sourceSystem: "mongodb", entity: "members", year: "2024", count: 1 }],
        targetAmounts: [],
        manifestHasAmounts: undefined,
      } as Partial<ReconcileInput>),
    );
    const row = report.rows[0]!;
    expect(row.delta).toBe(0);
    expect(row.verdict).toBe("RECONCILES");
  });

  it("catches the failure an aggregate hides", () => {
    // 2019 short by 40, 2023 long by 40. The total matches exactly, and this is
    // the entire reason the comparison is per year.
    const report = reconcile(
      base({
        manifest: manifest({ members: { "2019": 400, "2023": 400 } }),
        target: [
          { sourceSystem: "mongodb", entity: "members", year: "2019", count: 360 },
          { sourceSystem: "mongodb", entity: "members", year: "2023", count: 440 },
        ],
      }),
    );

    const totalSource = report.rows.reduce((a, r) => a + r.source, 0);
    const totalTarget = report.rows.reduce((a, r) => a + r.target, 0);
    expect(totalSource).toBe(totalTarget); // an aggregate would call this clean

    expect(report.verdict).toBe("DOES_NOT_RECONCILE");
    expect(report.rows.find((r) => r.year === "2019")?.delta).toBe(-40);
    expect(report.rows.find((r) => r.year === "2023")?.delta).toBe(40);
  });

  it("refuses to call a silent drop explained", () => {
    const report = reconcile(
      base({ target: [{ sourceSystem: "mongodb", entity: "members", year: "2024", count: 9 }] }),
    );
    expect(report.verdict).toBe("DOES_NOT_RECONCILE");
    expect(report.rows[0]!.delta).toBe(-1);
  });

  it("catches rows that appeared from nowhere", () => {
    // Worse than rows going missing, and easier to miss: nothing is absent.
    const report = reconcile(
      base({
        target: [
          { sourceSystem: "mongodb", entity: "members", year: "2024", count: 10 },
          { sourceSystem: "mongodb", entity: "members", year: "2025", count: 3 },
        ],
      }),
    );
    expect(report.verdict).toBe("DOES_NOT_RECONCILE");
    const invented = report.rows.find((r) => r.year === "2025")!;
    expect(invented.source).toBe(0);
    expect(invented.delta).toBe(3);
  });

  it("reports a field-level quarantine rather than folding it into a delta", () => {
    const report = reconcile(
      base({
        quarantined: [{ sourceSystem: "mongodb", entity: "member_phone", year: "2024", count: 4 }],
      }),
    );
    // A bucket whose source side is zero by construction would otherwise read
    // as an unexplained surplus of four rows.
    expect(report.unbucketed).toEqual([{ entity: "member_phone", count: 4 }]);
    expect(report.rows.every((r) => r.verdict === "RECONCILES")).toBe(true);
  });
});

describe("the financial comparison", () => {
  const amounts = { paid: { "2024": { rows: 10, cents: 15000 } } };

  it("catches money moving between statuses while the row count matches", () => {
    const targetAmounts: AmountObservation[] = [
      { entity: "payments", year: "2024", status: "paid", rows: 8, cents: 12000 },
      { entity: "payments", year: "2024", status: "failed", rows: 2, cents: 3000 },
    ];
    const report = reconcile(
      base({
        manifest: manifest({ payments: { "2024": 10 } }, amounts),
        target: [{ sourceSystem: "mongodb", entity: "payments", year: "2024", count: 10 }],
        targetAmounts,
      }),
    );

    // Ten rows in, ten rows out, nothing quarantined. A count-only or
    // total-only reconciliation reports this as clean; two payments silently
    // moved from paid to failed.
    expect(report.rows.every((r) => r.delta === 0)).toBe(true);
    expect(report.verdict).toBe("DOES_NOT_RECONCILE");

    const paid = report.financial.find((f) => f.status === "paid")!;
    expect(paid.rowDelta).toBe(-2);
    expect(paid.centsDelta).toBe(-3000);
  });

  it("applies the declared source mapping rather than comparing raw vocabularies", () => {
    // Mollie's `expired` has no equivalent in the contract's four statuses. It
    // folds into `failed` by a named rule, and the comparison must use the same
    // rule or it reports a difference the transform did on purpose.
    const report = reconcile(
      base({
        manifest: manifest(
          { payments: { "2024": 3 } },
          { expired: { "2024": { rows: 3, cents: 4500 } } },
        ),
        target: [{ sourceSystem: "mongodb", entity: "payments", year: "2024", count: 3 }],
        targetAmounts: [
          { entity: "payments", year: "2024", status: "failed", rows: 3, cents: 4500 },
        ],
      }),
    );
    expect(report.financial).toEqual([]);
    expect(report.verdict).toBe("RECONCILES");
  });

  it("will not guess at a status it has no mapping for", () => {
    const report = reconcile(
      base({
        manifest: manifest(
          { payments: { "2024": 1 } },
          { chargeback: { "2024": { rows: 1, cents: 1500 } } },
        ),
        target: [{ sourceSystem: "mongodb", entity: "payments", year: "2024", count: 1 }],
      }),
    );
    expect(report.verdict).toBe("NOT_YET_MEASURABLE");
    expect(report.notMeasurable.join(" ")).toContain("chargeback");
  });
});

describe("the verdict", () => {
  it("prefers NOT_YET_MEASURABLE to a confident answer from an incomplete run", () => {
    const report = reconcile(base({ manifest: manifest({}) }));
    expect(report.verdict).toBe("NOT_YET_MEASURABLE");
    expect(report.notMeasurable[0]).toContain("no source side");
  });

  it("will not say RECONCILES until a human has read some records", () => {
    const unsampled = reconcile(base({ samplesPerformed: 0 }));
    expect(unsampled.verdict).toBe("NOT_YET_MEASURABLE");
    expect(unsampled.rows.every((r) => r.verdict === "RECONCILES")).toBe(true);
    expect(unsampled.sampling.satisfied).toBe(false);

    const sampled = reconcile(base({ samplesPerformed: 10 }));
    expect(sampled.verdict).toBe("RECONCILES");
  });

  it("asks for one record per hundred, and never fewer than ten", () => {
    expect(requiredSamples(0)).toBe(10);
    expect(requiredSamples(500)).toBe(10);
    expect(requiredSamples(4200)).toBe(42);
  });
});

describe("the harness against the real fixture", () => {
  it("has no observation type that silently discards a count", () => {
    const observations: CountObservation[] = [
      { sourceSystem: "mongodb", entity: "members", year: "2024", count: 3 },
      { sourceSystem: "mongodb", entity: "members", year: "2024", count: 4 },
    ];
    const report = reconcile(
      base({ manifest: manifest({ members: { "2024": 7 } }), target: observations }),
    );
    // Two observations of the same bucket must sum, not overwrite.
    expect(report.rows[0]!.target).toBe(7);
  });
});
