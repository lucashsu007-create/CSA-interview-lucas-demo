/**
 * `@csa/api-client` — the frozen surface from contract §12.
 *
 * Both apps import this and nothing else reaches the database. The Next.js admin
 * app calls it directly and re-serves the §13 JSON API; the Expo app consumes
 * that HTTP API rather than SQL, so no client ever holds a database credential.
 *
 * Types come from `@csa/domain`, schemas and row parsers from `@csa/validation`.
 * The only types defined here are the four view models §12 names and has no home
 * for elsewhere: `EventListItem`, `EventDetail`, `RegistrationWithEvent` and
 * `DashboardSummary`.
 *
 * Exports are listed rather than re-exported wholesale, so the surface is
 * something you can read.
 */

/* Sessions — contract §11 ---------------------------------------------------- */
export {
  DEFAULT_SESSION_TTL_SECONDS,
  SESSION_AUDIENCE,
  SESSION_ISSUER,
  sessionClaimsJson,
  signSession,
  verifySession,
} from "./session";
export type { SessionClaims } from "./session";

/* Access — every call runs inside `set local request.jwt.claims` -------------- */
// `withPrivilegedRead` is exported deliberately, not casually. The admin app
// needs it to resolve a demo identity at sign-in, and without it that surface
// reaches around this package to the raw pool — which is strictly worse, since
// the reason enum and the `begin read only` guarantee are what keep elevated
// reads few, named and auditable.
export { closeDb, getDb, withPrivilegedRead, withSession } from "./db";
// A pure string helper, exported so `@csa/migrate` does not carry a second copy
// of it. libpq's `?host=/tmp` socket convention is not something the `postgres`
// driver understands, and two implementations of that translation would be two
// things to get wrong. It reaches no database and grants no privilege, so it
// widens nothing that §12 froze.
export { parseConnectionString } from "./db";
// The driver type map, exported for the same reason: `@csa/validation`'s row
// schemas parse the raw PostgreSQL timestamp text, so any connection that reads
// a row the apps read must decode timestamps identically. A second pool with
// the default decoder returns `Date` and every row schema rejects it — which is
// how `@csa/migrate`'s read-back found this.
export { RAW_TIMESTAMPS } from "./db";
export type { Db, PrivilegedReadReason, Sql } from "./db";

/* Reads ---------------------------------------------------------------------- */
export { getEvent, listPublishedEvents } from "./events";
export type { EventDetail, EventListItem } from "./events";

export { listPartners } from "./partners";

export { activeMembership } from "./membership";

export { myRegistrations } from "./registrations";
export type { RegistrationWithEvent } from "./registrations";

export { RECENT_CHECK_IN_LIMIT, dashboardSummary } from "./dashboard";
export type {
  DashboardCapacity,
  DashboardCheckIn,
  DashboardMembershipSplit,
  DashboardSummary,
} from "./dashboard";

/* Writes — thin wrappers over the two SECURITY DEFINER functions -------------- */
export {
  CSA_ERROR_TOKENS,
  CsaError,
  checkInTicket,
  isCsaError,
  isCsaErrorToken,
  registerForEvent,
  toCsaError,
} from "./rpc";
export type { CsaErrorToken } from "./rpc";

/* Migration console — contract §21, admin-only, additive to the frozen §12 --- */
export {
  QuarantineResolutionError,
  listImportRuns,
  listQuarantine,
  migrationOverview,
  resolveQuarantineRecord,
} from "./migration";
export type {
  ImportRunSummary,
  MigrationOverview,
  QuarantineItem,
  ResolveQuarantineInput,
} from "./migration";
