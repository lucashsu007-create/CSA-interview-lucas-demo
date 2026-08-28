/**
 * Writes the synthetic estate to disk.
 *
 *   pnpm --filter @csa/legacy-fixtures generate -- --out fixtures/legacy
 *
 * The extract timestamp is an argument, not the clock, so two runs of the same
 * seed produce byte-identical files and identical hashes. That is what makes
 * the manifest worth anything: a hash that changes every run identifies
 * nothing.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { argv, exit, stdout } from "node:process";

import { buildEstate } from "./corpus";
import { emitAll } from "./emit";
import { buildManifest } from "./manifest";

interface Args {
  out: string;
  seed: number;
  members: number;
  extractedAt: string;
}

function parseArgs(argsIn: readonly string[]): Args {
  const args: Args = {
    out: "fixtures/legacy",
    seed: 20260824,
    members: 96,
    // A fixed default, deliberately. The clock is not an input here.
    extractedAt: "2026-08-24T09:00:00Z",
  };
  for (let i = 0; i < argsIn.length; i += 1) {
    const flag = argsIn[i];
    const value = argsIn[i + 1];
    if (flag === "--help" || flag === "-h") {
      stdout.write(
        "Usage: generate [--out DIR] [--seed N] [--members N] [--extracted-at ISO]\n\n" +
          "Writes a synthetic WordPress + MongoDB + Forms + Mollie + office-register\n" +
          "extract, with a hashed manifest. Fictional data only.\n",
      );
      exit(0);
    }
    if (value === undefined) continue;
    if (flag === "--out") args.out = value;
    else if (flag === "--seed") args.seed = Number(value);
    else if (flag === "--members") args.members = Number(value);
    else if (flag === "--extracted-at") args.extractedAt = value;
  }
  if (!Number.isFinite(args.seed)) throw new Error("--seed must be a number");
  if (!Number.isInteger(args.members) || args.members < 1) {
    throw new Error("--members must be a positive integer");
  }
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(args.extractedAt)) {
    throw new Error("--extracted-at must be ISO-8601 UTC, e.g. 2026-08-24T09:00:00Z");
  }
  return args;
}

function main(): void {
  const args = parseArgs(argv.slice(2));
  const estate = buildEstate({ seed: args.seed, memberCount: args.members });
  const files = emitAll(estate);
  const manifest = buildManifest(files, {
    extractedAt: args.extractedAt,
    seed: args.seed,
    plantedDefects: estate.plantedDefects.length,
  });

  const root = resolve(args.out);
  for (const file of files) {
    const target = join(root, file.path);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, file.contents, "utf8");
  }
  writeFileSync(join(root, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n", "utf8");

  // The planted defects travel beside the extract, not inside it. An importer
  // must never read this file — it is the answer key the harness is graded
  // against, and grading yourself against your own output proves nothing.
  writeFileSync(
    join(root, "planted-defects.json"),
    JSON.stringify({ defects: estate.plantedDefects, merges: estate.plantedMerges }, null, 2) +
      "\n",
    "utf8",
  );

  stdout.write(`Synthetic legacy estate written to ${root}\n\n`);
  for (const entry of manifest.files) {
    const counts = Object.entries(entry.counts)
      .map(([entity, years]) => {
        const total = Object.values(years).reduce((a, b) => a + b, 0);
        return `${entity}=${total}`;
      })
      .join(" ");
    stdout.write(`  ${entry.path.padEnd(42)} ${entry.sha256.slice(0, 12)}…  ${counts}\n`);
  }
  stdout.write(
    `\n  ${manifest.plantedDefects} defects planted, recorded in planted-defects.json\n`,
  );
  stdout.write("  Fictional data only. No CSA system was read to produce this.\n");
}

main();
