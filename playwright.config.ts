/**
 * Playwright configuration for the CSA Digital Hub critical-flow suite.
 *
 * Concept prototype. Fictional data only.
 *
 *   pnpm test:e2e                    every layer that can run on this machine
 *   pnpm test:e2e --project=data     the data-layer proof alone (no browser)
 *   pnpm test:e2e --project=admin-ui the committee portal in Chromium
 *
 * The critical flow is one loop across three layers, and Wave 1 is building
 * them in parallel, so the suite is split by layer rather than by feature:
 *
 *   data      the loop as the database enforces it — admin publishes, member
 *             registers, staff scans, the numbers move. Needs only PostgreSQL,
 *             so it runs today and keeps running when the apps land.
 *   admin-ui  the same loop driven through the committee portal in a browser.
 *   member-api the §13 JSON API the Expo app consumes, driven over HTTP.
 *
 * Each project skips itself, loudly and with a reason, when its layer is not
 * there yet. Nothing here is allowed to pass vacuously.
 */
import { defineConfig, devices } from "@playwright/test";

import {
  BASE_URL,
  REPO_ROOT,
  adminAppBuilt,
  databaseUrl,
} from "./tests/critical-flow/support/environment";

const CI = process.env.CI !== undefined;

// Starting the admin app is opt-in (CSA_E2E_START_SERVER=1), not automatic.
//
// `webServer` is global: Playwright starts it for every run, including
// `--project=data`, which needs no HTTP at all. While Wave 1 is mid-flight the
// app can be present but not yet bootable, and then a webServer block turns
// "skipped, because the Admin workstream has not shipped it" into a two-minute
// opaque timeout on a project that never wanted a server. Default behaviour:
// use whatever is already listening on BASE_URL, and let the browser projects
// skip themselves with a reason when nothing is.
const admin = adminAppBuilt();
const startAdminApp =
  admin.ok &&
  process.env.CSA_E2E_START_SERVER === "1" &&
  process.env.CSA_E2E_BASE_URL === undefined;

export default defineConfig({
  testDir: "./tests/critical-flow",
  outputDir: "./test-results",

  // The flow is a narrative — publish, then register, then scan, then count —
  // and it shares one database. Parallelism would only make it lie.
  fullyParallel: false,
  workers: 1,

  forbidOnly: CI,
  retries: CI ? 1 : 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },

  reporter: CI
    ? [["github"], ["html", { open: "never" }]]
    : [["list"], ["html", { open: "never" }]],

  globalSetup: "./tests/critical-flow/support/global-setup.ts",
  globalTeardown: "./tests/critical-flow/support/global-teardown.ts",

  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    // Fictional demo data, local only — nothing here reaches a real service.
    ignoreHTTPSErrors: true,
  },

  projects: [
    {
      name: "data",
      testMatch: /.*\.db\.spec\.ts$/,
      use: {}, // no browser: these specs shell out to psql
    },
    {
      name: "member-api",
      testMatch: /.*\.api\.spec\.ts$/,
      use: { ...devices["Desktop Chrome"], baseURL: BASE_URL },
    },
    {
      name: "admin-ui",
      testMatch: /.*\.ui\.spec\.ts$/,
      use: { ...devices["Desktop Chrome"], baseURL: BASE_URL },
    },
  ],

  ...(startAdminApp
    ? {
        webServer: {
          command: "pnpm --filter @csa/admin dev",
          url: BASE_URL,
          cwd: REPO_ROOT,
          reuseExistingServer: !CI,
          timeout: 120_000,
          stdout: "pipe",
          stderr: "pipe",
          // Point the app at the suite's throwaway database, never at csa_dev.
          // CSA_SESSION_SECRET is deliberately not invented here: unset, the
          // api-client falls back to its development secret and says so.
          env: { CSA_DATABASE_URL: databaseUrl() },
        },
      }
    : {}),
});
