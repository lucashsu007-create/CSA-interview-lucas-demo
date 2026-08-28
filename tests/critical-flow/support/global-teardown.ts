/**
 * Drops the throwaway database global setup built.
 *
 * Concept prototype. Fictional data only.
 *
 * Set CSA_E2E_KEEP_DB=1 to keep it for post-mortem inspection after a failure.
 */
import { execFileSync } from "node:child_process";

import { E2E_DATABASE, KEEP_DATABASE, pgEnv, postgresAvailable } from "./environment";

export default function globalTeardown(): void {
  if (KEEP_DATABASE) {
    console.log(`[critical-flow] keeping ${E2E_DATABASE} (CSA_E2E_KEEP_DB=1)`);
    return;
  }
  if (!postgresAvailable().ok) return;

  try {
    execFileSync("dropdb", ["--if-exists", "--force", E2E_DATABASE], {
      env: pgEnv("postgres"),
      stdio: "pipe",
      timeout: 60_000,
    });
  } catch (error) {
    console.warn(`[critical-flow] could not drop ${E2E_DATABASE}: ${(error as Error).message}`);
  }
}
