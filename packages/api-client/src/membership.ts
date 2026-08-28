/**
 * Contract §12 — the caller's membership state.
 *
 * Contract §2: this, and never `users.role`, is what decides member pricing. An
 * `admin` with no live period pays the public price; an `attendee` with one pays
 * the member price. The authoritative resolution happens inside
 * `register_for_event`; this read is what puts the right number on the button.
 */

import type { MembershipPeriod, Uuid } from "@csa/domain";
import { parseMembershipPeriodRow, uuidSchema } from "@csa/validation";

import { withSession } from "./db";

/**
 * The caller's active period, or null.
 *
 * The predicate is copied from contract §4 verbatim —
 * `status = 'active' AND now() BETWEEN starts_at AND expires_at` — so it agrees
 * with `register_for_event` step 5 exactly, including SQL `BETWEEN` being
 * inclusive at both ends.
 *
 * The schema already forbids two overlapping active periods per user via a GiST
 * exclusion constraint, so `limit 1` cannot hide a second live membership; the
 * ordering just makes the result deterministic if that constraint is ever
 * relaxed.
 */
export async function activeMembership(as: Uuid): Promise<MembershipPeriod | null> {
  const userId = uuidSchema.parse(as);

  const rows = await withSession(userId, async (sql) => {
    const result = await sql`
      select mp.*
      from membership_periods mp
      where mp.user_id = ${userId}::uuid
        and mp.status = 'active'
        and now() between mp.starts_at and mp.expires_at
      order by mp.expires_at desc
      limit 1
    `;
    return [...result];
  });

  const row = rows[0];
  return row === undefined ? null : parseMembershipPeriodRow(row);
}
