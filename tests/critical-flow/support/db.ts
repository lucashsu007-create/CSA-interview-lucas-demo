/**
 * A tiny psql driver for the end-to-end suite.
 *
 * Concept prototype. Fictional data only.
 *
 * `psql` rather than the `postgres` npm driver on purpose. The driver is a
 * dependency of `packages/api-client`, which is being written in this same
 * wave; binding the suite to it would mean the critical-flow tests cannot run
 * until that package compiles, and the whole point of this layer is to prove
 * the loop before and after the TypeScript around it exists. psql is already
 * required by every other part of the tooling.
 *
 * Every call opens a transaction and issues `set local request.jwt.claims`
 * followed by `set local role authenticated`, which is exactly what contract
 * §11 specifies for the application. `set local` dies with the transaction, so
 * an identity cannot leak into the next call.
 */
import { execFileSync } from "node:child_process";

import { E2E_DATABASE, pgEnv } from "./environment";

export interface SessionOptions {
  /** `public.users.id` of the acting user, or null for a guest (contract §11). */
  readonly as?: string | null;
  /**
   * Overrides the database role. Guests are `anon`, everyone else
   * `authenticated`. `owner` issues no claims and no SET ROLE at all, which is
   * the migration / `service_role` path: RLS does not apply to the table owner,
   * so it is the only way to assert what a policy is hiding from someone else.
   */
  readonly role?: "anon" | "authenticated" | "owner";
  readonly database?: string;
}

function sqlString(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

/** The `set local` preamble contract §11 requires before any statement. */
function preamble({ as = null, role }: SessionOptions): string {
  const resolved = role ?? (as === null ? "anon" : "authenticated");
  if (resolved === "owner") return "";
  const claims = as === null ? { role: resolved } : { sub: as, role: resolved };
  return [
    `set local request.jwt.claims = ${sqlString(JSON.stringify(claims))};`,
    `set local role ${resolved};`,
  ].join("\n");
}

function run(script: string, database: string): string {
  try {
    return execFileSync("psql", ["-X", "-q", "-tA", "-v", "ON_ERROR_STOP=1", "-c", script], {
      env: pgEnv(database),
      stdio: "pipe",
      encoding: "utf8",
      timeout: 30_000,
    });
  } catch (error) {
    const stderr = String((error as { stderr?: Buffer }).stderr ?? "").trim();
    throw new Error(stderr || (error as Error).message);
  }
}

/**
 * Runs one SELECT under a session and returns its rows.
 *
 * The query is wrapped in `json_agg` so the result crosses the process boundary
 * as JSON rather than as psql's aligned text, which cannot represent a null
 * apart from an empty string.
 */
export function query<T = Record<string, unknown>>(sql: string, options: SessionOptions = {}): T[] {
  const database = options.database ?? E2E_DATABASE;
  const script = [
    "begin;",
    preamble(options),
    // json_agg cannot wrap a data-modifying statement — PostgreSQL only allows
    // those at the top level. Use execute() for writes and read the result back.
    `select coalesce(json_agg(t), '[]'::json) from (${sql.replace(/;\s*$/, "")}) t;`,
    "commit;",
  ].join("\n");
  const out = run(script, database).trim();
  return out === "" ? [] : (JSON.parse(out) as T[]);
}

/** The single row a query is expected to return. Throws if there is not exactly one. */
export function queryOne<T = Record<string, unknown>>(
  sql: string,
  options: SessionOptions = {},
): T {
  const rows = query<T>(sql, options);
  if (rows.length !== 1) {
    throw new Error(`expected exactly 1 row, got ${rows.length} from: ${sql}`);
  }
  return rows[0] as T;
}

export function scalar<T = string>(sql: string, options: SessionOptions = {}): T {
  const row = queryOne<Record<string, T>>(sql, options);
  const values = Object.values(row);
  if (values.length !== 1) throw new Error(`expected exactly 1 column from: ${sql}`);
  return values[0] as T;
}

/** Statements run for effect. Same session semantics, no result parsing. */
export function execute(sql: string, options: SessionOptions = {}): void {
  const database = options.database ?? E2E_DATABASE;
  run(
    ["begin;", preamble(options), sql.endsWith(";") ? sql : `${sql};`, "commit;"].join("\n"),
    database,
  );
}

/**
 * Captures the error token from a call that is supposed to fail.
 *
 * Contract §5 raises the token as the exception MESSAGE with a human sentence
 * in DETAIL, so clients switch on `event_full` rather than parsing prose. This
 * returns that token, which is what a test should assert on.
 */
export function expectFailure(sql: string, options: SessionOptions = {}): string {
  try {
    query(sql, options);
  } catch (error) {
    const text = (error as Error).message;
    const line = text.split("\n").find((l) => l.startsWith("ERROR:")) ?? text;
    return line.replace(/^ERROR:\s*/, "").trim();
  }
  throw new Error(`expected a failure but the statement succeeded: ${sql}`);
}

/**
 * Look up a seeded demo identity.
 *
 * As the owner, because this is the step the real application does before it
 * has an identity: `POST /api/session` picks a demo user server-side and mints
 * the JWT. There is no session to read it under yet.
 */
export function userIdByEmail(email: string): string {
  return scalar<string>(`select id from public.users where email = ${sqlString(email)}`, {
    role: "owner",
  });
}

export { sqlString };
