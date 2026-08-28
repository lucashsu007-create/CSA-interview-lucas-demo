/**
 * Builds the database the critical-flow suite runs against.
 *
 * Concept prototype. Fictional data only.
 *
 * It calls scripts/reset-db.sh rather than reimplementing migrate-and-seed, so
 * the suite exercises the same script a demo run uses. If reset-db.sh breaks,
 * these tests go red — which is the correct outcome, because "the project can
 * be started from the README" is part of what this suite is proving.
 *
 * The database is a throwaway (csa_e2e by default) and is dropped again in
 * global teardown. It is never csa_dev; environment.ts refuses that name.
 */
import { execFileSync } from "node:child_process";
import { join } from "node:path";

import { E2E_DATABASE, REPO_ROOT, pgEnv, postgresAvailable } from "./environment";

export default function globalSetup(): void {
  const server = postgresAvailable();
  if (!server.ok) {
    console.warn(`\n[critical-flow] ${server.reason}`);
    console.warn("[critical-flow] database-backed specs will be skipped.\n");
    return;
  }

  if (process.env.CSA_E2E_SKIP_RESET === "1") {
    console.log(`[critical-flow] reusing ${E2E_DATABASE} (CSA_E2E_SKIP_RESET=1)`);
    return;
  }

  console.log(`[critical-flow] building ${E2E_DATABASE} via scripts/reset-db.sh`);
  execFileSync(join(REPO_ROOT, "scripts/reset-db.sh"), ["--db", E2E_DATABASE, "--yes"], {
    cwd: REPO_ROOT,
    env: pgEnv(E2E_DATABASE),
    stdio: process.env.CI === undefined ? "inherit" : "pipe",
    timeout: 180_000,
  });
}
