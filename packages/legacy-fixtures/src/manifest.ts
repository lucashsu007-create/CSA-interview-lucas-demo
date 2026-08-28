/**
 * The extract manifest.
 *
 * An extract that cannot be re-identified later cannot support a reconciliation
 * later, so every file is hashed and stamped and its counts are recorded here,
 * before anything transforms a single row. The manifest is the artefact that
 * outlives the extract stage; a stage with no artefact did not happen.
 *
 * The timestamp is passed in rather than read from the clock. A generator that
 * calls `Date.now()` produces a different manifest on every run, which is the
 * one thing a manifest must never do.
 */
import { createHash } from "node:crypto";

import type { ExtractAmounts, ExtractCounts, ExtractFile } from "./emit";

export interface ManifestEntry {
  readonly path: string;
  readonly sourceSystem: string;
  readonly sha256: string;
  readonly bytes: number;
  readonly schemaVersion: string;
  readonly counts: ExtractCounts;
  readonly amounts?: ExtractAmounts;
}

export interface Manifest {
  readonly extractId: string;
  readonly extractedAt: string;
  readonly generator: string;
  readonly seed: number;
  readonly synthetic: true;
  readonly notice: string;
  readonly files: readonly ManifestEntry[];
  /** What the generator planted, so the importer can be judged on finding it. */
  readonly plantedDefects: number;
  readonly notExtracted: readonly string[];
}

export function sha256(contents: string): string {
  return createHash("sha256").update(contents, "utf8").digest("hex");
}

export interface ManifestOptions {
  readonly extractedAt: string;
  readonly seed: number;
  readonly plantedDefects: number;
}

export function buildManifest(files: readonly ExtractFile[], options: ManifestOptions): Manifest {
  return {
    extractId: `${options.extractedAt}/csa-legacy-estate`,
    extractedAt: options.extractedAt,
    generator: "@csa/legacy-fixtures",
    seed: options.seed,
    synthetic: true,
    notice:
      "Synthetic fixture for the CSA migration harness. Fictional identities only, all " +
      "addresses undeliverable by construction. No CSA system was read, written or probed " +
      "to produce this, and no import over these rows may be described as a migration.",
    files: files.map((f) => ({
      path: f.path,
      sourceSystem: f.sourceSystem,
      sha256: sha256(f.contents),
      bytes: Buffer.byteLength(f.contents, "utf8"),
      schemaVersion: f.schemaVersion,
      counts: f.counts,
      ...(f.amounts ? { amounts: f.amounts } : {}),
    })),
    plantedDefects: options.plantedDefects,
    // "Note what you could not extract, and why. A silently absent collection is
    // the most expensive kind of gap." — the ETL standard, Extract.
    notExtracted: [
      "wordpress: uploads/ media library — out of scope for this wave, no importer consumes it",
      "mongodb: `sessions` collection — operational, superseded, and holds no member record",
      "mollie: chargebacks — the fixture models none, so the harness must not claim to reconcile any",
    ],
  };
}
