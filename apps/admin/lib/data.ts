import type { UserRole, Uuid } from "@csa/domain";

import {
  activeMembership,
  dashboardSummary,
  getDb,
  getEvent,
  listImportRuns,
  listPublishedEvents,
  listQuarantine,
  migrationOverview,
  resolveQuarantineRecord,
  withSession,
  type DashboardSummary,
  type EventListItem,
  type ImportRunSummary,
  type MigrationOverview,
  type QuarantineItem,
} from "@csa/api-client";

import { DEMO_IDENTITIES, DEMO_IDENTITY_EMAILS } from "@/lib/identities";
import { viewerIdFromCookies } from "@/lib/session";
import type { IdentityOption, Viewer } from "@/lib/viewer";

/**
 * THE ONLY MODULE IN THIS APP THAT TALKS TO `@csa/api-client`.
 *
 * Everything reachable from a page or a route goes through here, for two
 * reasons. First, contract §10: PostgreSQL is reached server-side only, through
 * `packages/api-client`, and no client ever holds a database credential —
 * keeping the import in one server module makes that easy to audit rather than
 * merely true. Second, this is the integration seam: if the data layer's shape
 * moves, the failure lands here, in named functions, instead of scattered
 * across a dozen components.
 */

export type {
  DashboardSummary,
  EventListItem,
  ImportRunSummary,
  MigrationOverview,
  QuarantineItem,
};

/* -------------------------------------------------------------------------- */
/* Identity                                                                    */
/* -------------------------------------------------------------------------- */

interface UserRow {
  readonly id: Uuid;
  readonly email: string;
  readonly full_name: string;
  readonly role: UserRole;
}

/**
 * The four seeded identities from contract §7, resolved to their ids.
 *
 * Ids are not hardcoded anywhere: the seed regenerates them on every run and a
 * portal carrying stale uuids would sign you in as nobody. The emails are the
 * stable handle, and the list they are matched against is closed.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS IS THE ONE PRIVILEGED READ IN THE PORTAL — flagged for the lead.
 * ---------------------------------------------------------------------------
 * Contract §13 requires `POST /api/session` to turn a chosen demo identity into
 * a token, and `signSession` needs the `users.id`. Resolving it is a chicken and
 * egg: a caller who has not picked an identity is a guest, `withSession(null, …)`
 * assumes the `anon` role, and `anon` holds no grant at all on `users` — the
 * lookup that authenticates you cannot run under the identity it is trying to
 * establish. Verified, not assumed: `set_config('role','anon',true)` then
 * `select from users` returns "permission denied for table users".
 *
 * `@csa/api-client` has exactly the right mechanism for this — `withPrivilegedRead`,
 * a read-only transaction with the reason stamped into `application_name` — but
 * it is not on the exported surface and its reason list is a closed union with
 * no value for identity resolution. So this mirrors its discipline over the
 * exported pool instead: `begin read only`, so it cannot write even by mistake;
 * `application_name` stamped, so an elevated read is visible in
 * `pg_stat_activity` rather than invisible in a log nobody keeps; and the query
 * bounded to the four demo emails contract §7 publishes.
 *
 * THE FIX, when the data layer can take it: export `withPrivilegedRead` with a
 * third reason, `'demo-identity'`, and delete the pool access below.
 */
export async function listDemoIdentities(): Promise<IdentityOption[]> {
  const rows = await getDb().begin("read only", async (sql) => {
    await sql`select set_config('application_name', ${"csa/admin:demo-identity"}, true)`;
    const result = await sql<UserRow[]>`
      select id, email, full_name, role
      from users
      where email in ${sql(DEMO_IDENTITY_EMAILS as unknown as string[])}
    `;
    return [...result];
  });

  const byEmail = new Map(rows.map((row) => [row.email.toLowerCase(), row]));

  /* Ordered by the spec rather than by the database, so the switcher reads the
   * same way every time: the two committee identities first, because this is
   * the committee portal. */
  return DEMO_IDENTITIES.flatMap((spec) => {
    const row = byEmail.get(spec.email);
    if (row === undefined) return [];
    return [
      {
        id: row.id,
        email: row.email,
        fullName: row.full_name,
        role: row.role,
        purpose: spec.purpose,
      },
    ];
  });
}

export async function resolveIdentityByEmail(email: string): Promise<IdentityOption | null> {
  const identities = await listDemoIdentities();
  return identities.find((option) => option.email.toLowerCase() === email.toLowerCase()) ?? null;
}

/**
 * Who the session belongs to, with membership resolved BY THE SERVER.
 *
 * The user row is read under the caller's own session, so `users_read_self` is
 * what makes "me" mean me — this function cannot be pointed at somebody else.
 * `membership` is a fact the api-client produced from an active membership
 * period, never a date range for a component to judge, and contract §2 keeps it
 * strictly separate from `role`.
 */
export async function loadViewer(userId: Uuid): Promise<Viewer | null> {
  const rows = await withSession(userId, async (sql) => {
    const result = await sql<UserRow[]>`
      select id, email, full_name, role from users where id = ${userId}::uuid
    `;
    return [...result];
  });

  const row = rows[0];
  if (row === undefined) return null;

  const period = await activeMembership(userId);

  return {
    id: row.id,
    email: row.email,
    fullName: row.full_name,
    role: row.role,
    membership:
      period === null ? null : { memberNumber: period.memberNumber, expiresAt: period.expiresAt },
  };
}

export interface ShellContext {
  readonly viewer: Viewer | null;
  readonly identities: readonly IdentityOption[];
}

/**
 * What the chrome needs on every page.
 *
 * Failures degrade to "not signed in" with an empty switcher rather than taking
 * the whole shell down — a portal that renders a stack trace instead of a
 * header cannot tell you why it is broken, and the switcher already has an
 * honest empty state for the case where the identities did not load.
 */
export async function loadShellContext(): Promise<ShellContext> {
  const [identities, viewerId] = await Promise.all([
    listDemoIdentities().catch((error: unknown) => {
      console.error("[csa/admin] could not load demo identities", error);
      return [] as IdentityOption[];
    }),
    viewerIdFromCookies().catch(() => null),
  ]);

  const viewer = viewerId === null ? null : await loadViewer(viewerId).catch(() => null);
  return { viewer, identities };
}

/* -------------------------------------------------------------------------- */
/* Events                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Every event this identity is allowed to see, soonest first.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS IS TWO CALLS AND NOT ONE — flagged for the lead.
 * ---------------------------------------------------------------------------
 * Contract §12's only event list is `listPublishedEvents`, and it filters to
 * `status = 'published'` in SQL rather than leaving the decision to RLS. That
 * is right for the member app. It is wrong for a COMMITTEE register, which
 * exists to show the draft that is not live yet, the evening that sold out and
 * the trip that was cancelled — `events_read_staff` already grants exactly
 * that, and `getEvent` already honours it ("No status filter here: RLS
 * decides").
 *
 * So the published list comes from the frozen call, and the remainder is
 * fetched one row at a time through `getEvent`, which is also a frozen call.
 * The id enumeration in between runs under the CALLER's session, so RLS is what
 * decides which ids exist at all: a guest sees only published ids and the
 * second step does nothing, while staff see the rest. Nothing here recomputes
 * capacity — `registeredCount` and `spotsRemaining` arrive on the objects the
 * data layer built, because a number a screen derived is one that can change
 * before the next statement.
 *
 * THE FIX, when the data layer can take it: one `listEventsForCommittee(as)`
 * that leaves the status filter to RLS. Then this collapses to a single call
 * and the N+1 disappears. N is three on the current seed.
 */
export async function loadEvents(as: Uuid | null): Promise<EventListItem[]> {
  const published = await listPublishedEvents(as);

  const visibleIds = await withSession(as, async (sql) => {
    const rows = await sql<{ id: Uuid }[]>`select id from events`;
    return rows.map((row) => row.id);
  });

  const seen = new Set(published.map((event) => event.id));
  const rest = await Promise.all(
    visibleIds.filter((id) => !seen.has(id)).map((id) => getEvent(as, id)),
  );

  return [...published, ...rest.filter((event) => event !== null)].sort(
    (a, b) => a.startsAt.getTime() - b.startsAt.getTime(),
  );
}

/* -------------------------------------------------------------------------- */
/* Dashboard                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * The dashboard reads under the CALLER's session, so RLS scopes it: `staff` and
 * `admin` get the committee-wide picture, a plain attendee gets their own rows.
 *
 * That second case is why `app/page.tsx` gates on role instead of rendering the
 * numbers anyway. An attendee's `registrationsToday` is a truthful count of
 * their own registrations and a completely misleading committee metric, and
 * "never render a derived guess as a fact" covers a real number under the wrong
 * label just as much as an invented one.
 */
export async function loadDashboard(as: Uuid): Promise<DashboardSummary> {
  return dashboardSummary(as);
}

/* -------------------------------------------------------------------------- */
/* Migration console — contract §21                                            */
/* -------------------------------------------------------------------------- */

/**
 * All three read under the CALLER's session, and every one of these tables is
 * confined to `admin` by RLS. The page gates on role as well, but the gate that
 * matters is the one in the database: a handler bug then shows an admin an
 * empty console rather than showing a member somebody's legacy record.
 */
export async function loadMigrationOverview(as: Uuid): Promise<MigrationOverview> {
  return withSession(as, (sql) => migrationOverview(sql));
}

export async function loadImportRuns(as: Uuid, limit = 20): Promise<ImportRunSummary[]> {
  return withSession(as, (sql) => listImportRuns(sql, limit));
}

export async function loadQuarantine(
  as: Uuid,
  options: { state?: "open" | "resolved" | "discarded"; limit?: number } = {},
): Promise<QuarantineItem[]> {
  return withSession(as, (sql) => listQuarantine(sql, options));
}

/**
 * Closing a quarantined record, in the caller's own name.
 *
 * The update and its `audit_events` row go in one `withSession` transaction, so
 * they commit together or not at all. An override recorded in one and not the
 * other looks like an audit trail and is not one.
 */
export async function resolveQuarantine(
  as: Uuid,
  input: { id: Uuid; note: string; state: "resolved" | "discarded" },
): Promise<QuarantineItem> {
  return withSession(as, (sql) => resolveQuarantineRecord(sql, { ...input, actorUserId: as }));
}
