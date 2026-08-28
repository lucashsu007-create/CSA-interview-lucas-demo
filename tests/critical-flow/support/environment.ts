/**
 * What this machine can actually run right now.
 *
 * Concept prototype. Fictional data only.
 *
 * Wave 1 builds `packages/api-client`, `apps/admin` and `apps/mobile` in
 * parallel with this suite, so at any moment some layers of the critical flow
 * are drivable and some are not. Every probe here answers one question — "can
 * this layer be exercised, and if not, why not?" — and each spec turns the
 * answer into either a real assertion or a skip that names the missing piece.
 *
 * A spec that cannot reach its subject is skipped, never softened. A green run
 * that asserted nothing is worse than a missing test, because it is a claim.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

/** Where the admin app serves both the committee UI and the JSON API (contract §10). */
export const BASE_URL = process.env.CSA_E2E_BASE_URL ?? "http://127.0.0.1:3000";

/**
 * The suite builds and drops its own database. It must never be the one a
 * developer or another workstream is using, because global teardown drops it.
 */
export const E2E_DATABASE = process.env.CSA_E2E_DB ?? "csa_e2e";
export const KEEP_DATABASE = process.env.CSA_E2E_KEEP_DB === "1";

if (E2E_DATABASE === "csa_dev") {
  throw new Error(
    "CSA_E2E_DB must not be csa_dev: this suite drops and rebuilds its database between runs. " +
      "Leave it unset to use csa_e2e.",
  );
}

/** The seeded demo identities (contract §7). Fictional, `.local`, undeliverable. */
export const DEMO = {
  member: "member@demo.local",
  nonMember: "nonmember@demo.local",
  admin: "admin@demo.local",
  staff: "staff@demo.local",
} as const;

export interface Probe {
  readonly ok: boolean;
  readonly reason: string;
}

/**
 * libpq environment for every psql call. PGHOST is discovered rather than
 * assumed: there is no Docker and no Supabase CLI here, so PostgreSQL is a
 * local server reached over a unix socket whose directory differs by distro.
 */
export function pgEnv(database: string = E2E_DATABASE): NodeJS.ProcessEnv {
  const port = process.env.PGPORT ?? "5432";
  let host = process.env.PGHOST;
  if (host === undefined) {
    host =
      ["/tmp", "/var/run/postgresql", "/run/postgresql"].find((dir) =>
        existsSync(join(dir, `.s.PGSQL.${port}`)),
      ) ?? "localhost";
  }
  return { ...process.env, PGHOST: host, PGPORT: port, PGDATABASE: database };
}

/**
 * The connection string for the suite's database, in the form
 * `packages/api-client` accepts (contract §10 — the driver, not PostgREST).
 * libpq spells a unix socket as an empty host plus `?host=`.
 */
export function databaseUrl(database: string = E2E_DATABASE): string {
  const env = pgEnv(database);
  const host = env.PGHOST ?? "localhost";
  const port = env.PGPORT ?? "5432";
  return host.startsWith("/")
    ? `postgresql:///${database}?host=${host}${port === "5432" ? "" : `&port=${port}`}`
    : `postgresql://${host}:${port}/${database}`;
}

let postgresProbe: Probe | undefined;

/** Is there a server to talk to at all? Cached — this runs per spec file. */
export function postgresAvailable(): Probe {
  if (postgresProbe !== undefined) return postgresProbe;
  try {
    execFileSync("psql", ["-X", "-q", "-tA", "-d", "postgres", "-c", "select 1"], {
      env: pgEnv("postgres"),
      stdio: "pipe",
      timeout: 10_000,
    });
    postgresProbe = { ok: true, reason: "" };
  } catch (error) {
    const env = pgEnv("postgres");
    postgresProbe = {
      ok: false,
      reason:
        `no PostgreSQL at host=${env.PGHOST} port=${env.PGPORT} — ` +
        `start one and run scripts/dev-setup.sh (${(error as Error).message.split("\n")[0]})`,
    };
  }
  return postgresProbe;
}

export function databaseReady(): Probe {
  const server = postgresAvailable();
  if (!server.ok) return server;
  try {
    const out = execFileSync(
      "psql",
      [
        "-X",
        "-q",
        "-tA",
        "-c",
        "select count(*) from public.users where email like '%@demo.local'",
      ],
      { env: pgEnv(), stdio: "pipe", encoding: "utf8", timeout: 10_000 },
    );
    return Number(out.trim()) > 0
      ? { ok: true, reason: "" }
      : { ok: false, reason: `database ${E2E_DATABASE} has no seeded demo identities` };
  } catch {
    return {
      ok: false,
      reason: `database ${E2E_DATABASE} is not migrated and seeded — global setup did not complete`,
    };
  }
}

/**
 * Has the Admin workstream produced something a browser can drive yet?
 *
 * Deliberately structural rather than a version check: an app-router directory
 * with a root layout is the smallest thing that can serve a page, and the
 * committee portal cannot be driven before that exists.
 */
export function adminAppBuilt(): Probe {
  const app = join(REPO_ROOT, "apps/admin");
  if (!existsSync(app)) {
    return { ok: false, reason: "apps/admin does not exist yet (Wave 1, Admin workstream)" };
  }
  const routers = [join(app, "app"), join(app, "src/app")].filter((dir) => existsSync(dir));
  if (routers.length === 0) {
    return {
      ok: false,
      reason: "apps/admin has no app router yet — the Admin workstream is still scaffolding it",
    };
  }
  const hasLayout = routers.some((dir) =>
    readdirSync(dir).some((f) => /^layout\.(tsx|jsx|ts|js)$/.test(f)),
  );
  return hasLayout
    ? { ok: true, reason: "" }
    : { ok: false, reason: "apps/admin app router has no root layout yet" };
}

/** Route handlers for the §13 JSON API the Expo app consumes. */
export function adminApiBuilt(): Probe {
  const built = adminAppBuilt();
  if (!built.ok) return built;
  const app = join(REPO_ROOT, "apps/admin");
  const found = [join(app, "app/api"), join(app, "src/app/api")].some((dir) => existsSync(dir));
  return found
    ? { ok: true, reason: "" }
    : { ok: false, reason: "apps/admin has no app/api route handlers yet (contract §13)" };
}

/** Is something actually listening on BASE_URL? Answered at run time, per spec. */
export async function serverReachable(): Promise<Probe> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.signal.dispatchEvent(new Event("abort")), 5_000);
    await fetch(BASE_URL, { signal: AbortSignal.timeout(5_000) }).finally(() =>
      clearTimeout(timer),
    );
    return { ok: true, reason: "" };
  } catch {
    return {
      ok: false,
      reason: `nothing serving ${BASE_URL} — start it with \`pnpm --filter @csa/admin dev\``,
    };
  }
}
