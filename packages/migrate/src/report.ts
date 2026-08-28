/**
 * Rendering a reconciliation for a human.
 *
 * The shape is the one the csa-data-migration standard specifies, because the
 * point of a fixed shape is that two runs a month apart can be compared by eye.
 * Nothing here rounds, and nothing here reports a percentage: a percentage
 * without its denominator is the standard's named failure, and every number
 * below is a count or a whole number of cents.
 */
import type { ReconcileReport } from "./reconcile";

const euro = (cents: number) => `${cents < 0 ? "-" : ""}€${Math.abs(cents / 100).toFixed(2)}`;

export function renderReport(report: ReconcileReport, options: { synthetic: boolean }): string {
  const lines: string[] = [];

  lines.push(
    "entity           source system   year     source  target   quar  merged  delta  verdict",
  );
  lines.push("-".repeat(92));
  for (const row of report.rows) {
    lines.push(
      [
        row.entity.padEnd(16),
        row.sourceSystem.padEnd(15),
        row.year.padEnd(8),
        String(row.source).padStart(6),
        String(row.target).padStart(7),
        String(row.quarantined).padStart(6),
        String(row.merged).padStart(7),
        (row.delta > 0 ? `+${row.delta}` : String(row.delta)).padStart(6),
        "  " + (row.verdict === "RECONCILES" ? "RECONCILES" : "UNEXPLAINED  <<<"),
      ].join(""),
    );
  }

  if (report.unbucketed.length > 0) {
    lines.push("");
    lines.push("Field-level quarantine (no source row count to compare against)");
    for (const u of report.unbucketed) lines.push(`  ${u.entity}: ${u.count}`);
  }

  lines.push("");
  if (report.financial.length === 0) {
    lines.push("Financial findings: none — every status reconciles on both rows and cents.");
  } else {
    lines.push("Financial findings");
    for (const f of report.financial) {
      lines.push(
        `  ${f.entity} ${f.year}: status ${f.status} differs by ` +
          `${f.rowDelta >= 0 ? "+" : ""}${f.rowDelta} rows, ` +
          `${f.centsDelta >= 0 ? "+" : ""}${euro(f.centsDelta)}`,
      );
    }
  }

  lines.push("");
  lines.push(
    `Manual sampling: ${report.sampling.performed} of ${report.sampling.required} records read ` +
      `by a human — ${report.sampling.satisfied ? "satisfied" : "NOT satisfied"}`,
  );
  lines.push(`  ${report.sampling.note}`);

  if (report.notMeasurable.length > 0) {
    lines.push("");
    lines.push("Not measurable");
    for (const n of report.notMeasurable) lines.push(`  - ${n}`);
  }

  lines.push("");
  lines.push(`VERDICT: ${report.verdict}`);
  if (report.verdict === "RECONCILES") {
    lines.push(
      "  A green comparison is a necessary condition and never a sufficient one. §17 also",
      "  requires approved dedup rules in writing, and access controls and audit logs",
      "  reviewed on the target.",
    );
  }
  if (options.synthetic) {
    lines.push("");
    lines.push(
      "  SYNTHETIC FIXTURES. This reconciles a generated corpus against itself. It is not",
      "  a migration of CSA data and must never be reported as one.",
    );
  }
  return lines.join("\n") + "\n";
}
