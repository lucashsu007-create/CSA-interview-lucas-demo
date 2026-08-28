/**
 * The migration harness, end to end.
 *
 *   pnpm migrate --extract fixtures/legacy --mode dry_run
 *   pnpm migrate --extract fixtures/legacy --mode load --db postgresql:///csa_staging
 *
 * `dry_run` is the default and needs no database. That ordering is deliberate:
 * the first thing anyone runs should be the one that writes nothing.
 */
import { argv, env, exit, stdout } from "node:process";

import { isImportMode } from "@csa/domain";
import type { ImportMode } from "@csa/domain";

import { load } from "./load";
import { loadExtract } from "./read";
import { mergeCounts, quarantineCounts, targetAmounts, targetCounts } from "./observe";
import { reconcile } from "./reconcile";
import { buildRedirectMap, unmapped } from "./redirects";
import { renderReport } from "./report";
import { transform } from "./transform";
import { REFUSED_RULES } from "./rules";

interface Args {
  extract: string;
  mode: ImportMode;
  databaseUrl: string | undefined;
  samples: number;
  showRefused: boolean;
}

const USAGE = `Usage: migrate [options]

  --extract DIR     the extract directory, containing manifest.json
                    (default: fixtures/legacy)
  --mode MODE       dry_run | load | delta          (default: dry_run)
  --db URL          PostgreSQL connection; required for load and delta
                    (default: $CSA_MIGRATE_DATABASE_URL)
  --samples N       how many records a human has actually read  (default: 0)
  --refused         print the rules this harness deliberately does not have

dry_run performs the entire transform and writes no target rows. Load into a
STAGING database first; never a first run against anything that matters.

Synthetic fixtures only. No CSA system is read, written or probed by any of
this, and no run over fictional rows is a migration of anything.
`;

function parseArgs(input: readonly string[]): Args {
  const args: Args = {
    extract: "fixtures/legacy",
    mode: "dry_run",
    databaseUrl: env["CSA_MIGRATE_DATABASE_URL"],
    samples: 0,
    showRefused: false,
  };
  for (let i = 0; i < input.length; i += 1) {
    const flag = input[i];
    if (flag === "--help" || flag === "-h") {
      stdout.write(USAGE);
      exit(0);
    }
    if (flag === "--refused") {
      args.showRefused = true;
      continue;
    }
    const value = input[i + 1];
    if (value === undefined) continue;
    if (flag === "--extract") args.extract = value;
    else if (flag === "--db") args.databaseUrl = value;
    else if (flag === "--samples") args.samples = Number(value);
    else if (flag === "--mode") {
      if (!isImportMode(value)) throw new Error(`--mode must be dry_run, load or delta`);
      args.mode = value;
    }
  }
  if (!Number.isInteger(args.samples) || args.samples < 0) {
    throw new Error("--samples must be a non-negative integer");
  }
  if (args.mode !== "dry_run" && !args.databaseUrl) {
    throw new Error(`--mode ${args.mode} needs --db or CSA_MIGRATE_DATABASE_URL`);
  }
  return args;
}

async function main(): Promise<number> {
  const args = parseArgs(argv.slice(2));

  if (args.showRefused) {
    stdout.write("Rules this harness deliberately does not have:\n\n");
    for (const rule of REFUSED_RULES) stdout.write(`  - ${rule}\n`);
    stdout.write("\n");
  }

  // Reads and verifies every hash before transforming a single row. An extract
  // whose bytes moved since it was counted cannot support the count.
  const extract = loadExtract(args.extract);
  stdout.write(`Extract ${extract.manifest.extractId}\n`);
  stdout.write(`  ${extract.manifest.files.length} files, hashes verified against the manifest\n`);
  for (const note of extract.manifest.notExtracted ?? []) {
    stdout.write(`  not extracted: ${note}\n`);
  }

  const result = transform(extract);
  stdout.write(
    `\nTransform: ${result.records.length} source rows, ` +
      `${result.quarantine.length} quarantined, ${result.dedup.length} merged\n`,
  );
  stdout.write("  minimised out of the target:\n");
  for (const field of result.minimisedFields) stdout.write(`    - ${field}\n`);

  // ---------------------------------------------------------------------------
  // The redirect map, checked before anything is written
  // ---------------------------------------------------------------------------
  const redirects = buildRedirectMap(extract);
  const missing = unmapped(extract, redirects);
  stdout.write(
    `\nRedirects: ${redirects.moved} moved, ${redirects.gone} retired, ` +
      `${missing.length} unanswered\n`,
  );
  if (missing.length > 0) {
    // A URL nobody decided about is the one that 404s a year later with nobody
    // watching. It fails the run rather than appearing in a report.
    stdout.write("  no rule for:\n");
    for (const url of missing.slice(0, 10)) stdout.write(`    ${url}\n`);
    if (missing.length > 10) stdout.write(`    ...and ${missing.length - 10} more\n`);
    throw new Error(`${missing.length} legacy URLs have no redirect rule`);
  }

  if (args.mode !== "dry_run") {
    const mollie = extract.manifest.files.find((f) => f.sourceSystem === "mollie");
    const outcome = await load(result, {
      databaseUrl: args.databaseUrl!,
      mode: args.mode,
      // The whole estate, not one system of it.
      sourceSystem: null,
      extractId: extract.manifest.extractId,
      extractSha256: mollie?.sha256 ?? extract.manifest.files[0]!.sha256,
      extractSchemaVersion: extract.manifest.files[0]!.schemaVersion,
      extractCounts: Object.fromEntries(
        extract.manifest.files.map((f) => [f.sourceSystem + "/" + f.path, f.counts]),
      ),
      redirects,
    });
    stdout.write(`\nLoad ${outcome.importRunId} (${outcome.mode})\n`);
    for (const [table, n] of Object.entries(outcome.written)) {
      stdout.write(`  wrote    ${table.padEnd(20)} ${n}\n`);
    }
    for (const [table, n] of Object.entries(outcome.skippedAlreadyPresent)) {
      stdout.write(`  skipped  ${table.padEnd(20)} ${n}  (already present, or not modelled)\n`);
    }
    for (const [table, n] of Object.entries(outcome.readBack)) {
      // Read back through the schemas the apps use. An importer that writes
      // rows the application cannot parse has loaded nothing usable.
      stdout.write(`  readback ${table.padEnd(20)} ${n}  parsed by @csa/validation\n`);
    }
  }

  const report = reconcile({
    manifest: extract.manifest,
    target: targetCounts(result),
    quarantined: quarantineCounts(result),
    merged: mergeCounts(result),
    targetAmounts: targetAmounts(result),
    samplesPerformed: args.samples,
  });

  stdout.write("\n" + renderReport(report, { synthetic: true }));

  // Exit codes: 0 reconciles, 1 does not, 2 not yet measurable. A build that
  // treats "not yet measurable" as success is a build that ships an unmeasured
  // migration.
  return report.verdict === "RECONCILES" ? 0 : report.verdict === "DOES_NOT_RECONCILE" ? 1 : 2;
}

main().then(
  (code) => exit(code),
  (error: unknown) => {
    stdout.write(`\nmigrate failed: ${error instanceof Error ? error.message : String(error)}\n`);
    exit(2);
  },
);
