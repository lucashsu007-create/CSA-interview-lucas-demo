/**
 * Contract §10 and §11 — the only place in the system that opens a database
 * connection.
 *
 * Two rules carry the whole security model:
 *
 *  1. **Every** call runs inside a transaction that issues
 *     `set local request.jwt.claims` before it touches a table. `set local`
 *     dies with the transaction, so a claim can never leak into the next
 *     borrower of a pooled connection. Nothing here uses a plain `set`.
 *  2. The transaction also assumes the PostgreSQL role the request deserves —
 *     `anon` for a guest, `authenticated` for a session. Without that step RLS
 *     is inert: this prototype connects as the schema owner, and the owner is
 *     exempt from every policy (no table uses `FORCE ROW LEVEL SECURITY`, and
 *     it must not, or the `SECURITY DEFINER` helpers would recurse). On a real
 *     Supabase project PostgREST does exactly this — it connects as
 *     `authenticator` and switches role per request — so this mirrors the
 *     target topology rather than working around it.
 *
 * Neither the connection string nor the claim set is ever logged.
 */

import { isUuid } from "@csa/domain";
import type { Uuid } from "@csa/domain";
import postgres from "postgres";
import type { Options, PostgresType, Sql as PostgresSql, TransactionSql } from "postgres";

import { sessionClaimsJson } from "./session";

/**
 * The handle handed to a `withSession` callback. Always a transaction: there is
 * no way to reach the database outside one.
 */
export type Sql = TransactionSql<Record<string, never>>;

/** The pool itself. Exported for lifecycle control only — never to query with. */
export type Db = PostgresSql<Record<string, never>>;

/**
 * Fallback connection for a local demo, matching the README's
 * `createdb csa_dev` sequence. Override with `CSA_DATABASE_URL`.
 */
const DEV_FALLBACK_DATABASE_URL = "postgresql:///csa_dev?host=/tmp";

/** Contract §11. `service_role` is never one of these. */
const GUEST_ROLE = "anon";
const SESSION_ROLE = "authenticated";

/**
 * Timestamps come back as the raw PostgreSQL text (`2026-09-22 15:00:00+02`)
 * rather than as `Date`.
 *
 * `@csa/validation` owns the single conversion from wire timestamp to domain
 * `Date` — its row schemas take ISO-ish strings and `toDate` normalises the
 * `+02` short offset that PostgreSQL emits and ECMAScript does not accept. If
 * the driver pre-parsed them, every row would arrive already converted by a
 * second, unvalidated code path. Serialisation is left at the default so a
 * `Date` parameter still binds correctly.
 */
export const RAW_TIMESTAMPS: Record<string, PostgresType> = {
  date: {
    to: 1184,
    from: [1082, 1114, 1184],
    serialize: (value: unknown): string =>
      (value instanceof Date ? value : new Date(value as string)).toISOString(),
    parse: (raw: string): string => raw,
  },
};

/**
 * `postgres` does not understand libpq's `?host=/run/postgresql` convention for
 * unix sockets — it forwards unknown query parameters as server settings, and
 * the backend then rejects `host` as an unrecognised configuration parameter.
 * Lift it into the driver's own `host` option instead.
 */
export function parseConnectionString(raw: string): { url: string; host?: string } {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    // Not a URL (a bare `host=/tmp dbname=...` keyword string, say). Hand it to
    // the driver untouched and let it produce the error.
    return { url: raw };
  }

  const host = parsed.searchParams.get("host");
  if (host === null || !host.startsWith("/")) {
    return { url: raw };
  }

  parsed.searchParams.delete("host");
  return { url: parsed.toString(), host };
}

function databaseUrl(): string {
  return (
    process.env["CSA_DATABASE_URL"] || process.env["DATABASE_URL"] || DEV_FALLBACK_DATABASE_URL
  );
}

let pool: Db | null = null;

/**
 * The lazily created pool. Lazy so that importing this package — which the
 * shared types make attractive — does not open a socket, and so that a test can
 * set `CSA_DATABASE_URL` before the first query.
 */
export function getDb(): Db {
  if (pool !== null) return pool;

  const { url, host } = parseConnectionString(databaseUrl());
  const options: Options<Record<string, PostgresType>> = {
    types: RAW_TIMESTAMPS,
    // Notices (`NOTICE:` from the migration DO blocks, for instance) are not
    // application output and must not be printed by a library.
    onnotice: () => {},
    max: 10,
  };
  if (host !== undefined) options.host = host;

  pool = postgres(url, options) as unknown as Db;
  return pool;
}

/** Closes the pool. Call from a test teardown or a server shutdown hook. */
export async function closeDb(): Promise<void> {
  if (pool === null) return;
  const closing = pool;
  pool = null;
  await closing.end({ timeout: 5 });
}

/**
 * Runs `fn` inside one transaction that has already assumed `userId`'s identity.
 *
 * The claim set is bound as a **parameter** to `set_config(..., is_local => true)`,
 * which is the parameterisable spelling of `set local` — `SET` itself takes no
 * placeholders, and building the statement by concatenation would put a uuid
 * into SQL text. A guest (`userId === null`) sets no claims at all, so
 * `current_app_user_id()` returns NULL and the policies fall back to the
 * published-events-only path.
 *
 * Ordering is deliberate: claims first, role second, caller's work third.
 * Nothing reads a table before the identity is in place.
 */
export async function withSession<T>(
  userId: Uuid | null,
  fn: (sql: Sql) => Promise<T>,
): Promise<T> {
  if (userId !== null && !isUuid(userId)) {
    throw new TypeError("withSession expects a uuid or null");
  }

  const db = getDb();

  const result = await db.begin(async (sql) => {
    if (userId !== null) {
      await sql`select set_config('request.jwt.claims', ${sessionClaimsJson(userId)}, true)`;
    }
    await sql`select set_config('role', ${userId === null ? GUEST_ROLE : SESSION_ROLE}, true)`;
    return fn(sql);
  });

  return result as T;
}

/**
 * The two aggregates the current schema cannot express through RLS.
 *
 * Both are deliberately narrow and both are read-only. See {@link withPrivilegedRead}.
 */
export type PrivilegedReadReason =
  /**
   * How many places an event has taken. Public information — it is what
   * "3 spots left" on a card means — but it lives in `registrations`, which
   * `anon` cannot read at all and an attendee can read only their own rows of.
   * A join would therefore either error for a guest or silently under-count for
   * a member.
   */
  | "public-event-capacity"
  /**
   * The event a caller already holds a ticket for. `events_read_published`
   * hides `sold_out` and `cancelled` events, so joining a member's own
   * registrations to `events` under their session would drop the tickets they
   * most need to see. The registration set is RLS-filtered first, so this only
   * ever widens to events the caller has demonstrably registered for.
   */
  | "own-ticket-events"
  /**
   * Resolving a seeded demo email to a `users.id` at sign-in. Chicken-and-egg:
   * the caller has not picked an identity yet, so they are `anon`, and `anon`
   * has no grant on `users` at all. Bounded to the four published demo
   * identities — it is a fixture of the prototype, not a login mechanism, and
   * it disappears with the seeded-session model.
   */
  | "demo-identity";

/**
 * A **read-only** transaction that does not assume a caller identity.
 *
 * This is the one place in the package that reads with the connection's own
 * privileges, and it exists only because two facts the contract treats as
 * visible are stored in tables RLS hides. Both uses are enumerated in
 * {@link PrivilegedReadReason} and both return aggregates or rows the caller is
 * already entitled to. `begin read only` means it cannot write even by mistake,
 * and the reason is stamped into `application_name` so an elevated read is
 * visible in `pg_stat_activity` rather than being invisible in a log nobody
 * keeps.
 *
 * It disappears the moment the schema grows a `security definer` capacity view
 * and an `events_read_own_registration` policy — see the note filed with the
 * lead.
 */
export async function withPrivilegedRead<T>(
  reason: PrivilegedReadReason,
  fn: (sql: Sql) => Promise<T>,
): Promise<T> {
  const db = getDb();

  const result = await db.begin("read only", async (sql) => {
    await sql`select set_config('application_name', ${`csa/api-client:${reason}`}, true)`;
    return fn(sql);
  });

  return result as T;
}
