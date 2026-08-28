/**
 * Contract §4: a membership is active when
 * `status = 'active' AND now() BETWEEN starts_at AND expires_at`.
 *
 * SQL `BETWEEN` is inclusive at both ends, so a period whose `expires_at` is
 * exactly the instant being tested is still active. These functions reproduce
 * that boundary exactly; if they disagreed with the database, the client would
 * offer a member price the server then refused.
 *
 * Pure: no database access, no clock. The instant is always passed in.
 */

import type { MembershipPeriod } from "./entities";

export function isMembershipActive(period: MembershipPeriod, at: Date): boolean {
  if (period.status !== "active") return false;
  const instant = at.getTime();
  return instant >= period.startsAt.getTime() && instant <= period.expiresAt.getTime();
}

/**
 * The contract guarantees at most one active period per user, so the first
 * match is the only match. Returns null when none is active.
 */
export function findActiveMembership(
  periods: readonly MembershipPeriod[],
  at: Date,
): MembershipPeriod | null {
  return periods.find((period) => isMembershipActive(period, at)) ?? null;
}

/** The single input that decides member pricing. Contract §2. */
export function hasActiveMembership(periods: readonly MembershipPeriod[], at: Date): boolean {
  return findActiveMembership(periods, at) !== null;
}
