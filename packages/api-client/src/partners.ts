/**
 * Contract §12 — the partner directory.
 *
 * The only fully public table in the schema: `partners_read_all` is `using (true)`
 * for both `anon` and `authenticated`, so a guest sees the same list a member
 * does. The discounts are the pull; the membership card is what redeems them.
 */

import type { Partner, Uuid } from "@csa/domain";
import { parsePartnerRows } from "@csa/validation";

import { withSession } from "./db";

/**
 * Every partner, alphabetically.
 *
 * `city`, `category`, `discount_text` and `address` are nullable columns but
 * non-null in `partnerRowSchema`, so they are coalesced to empty strings rather
 * than failing the parse on a partially filled row.
 */
export async function listPartners(as: Uuid | null): Promise<Partner[]> {
  const rows = await withSession(as, async (sql) => {
    const result = await sql`
      select
        p.id,
        p.name,
        coalesce(p.city, '') as city,
        coalesce(p.category, '') as category,
        coalesce(p.discount_text, '') as discount_text,
        coalesce(p.address, '') as address
      from partners p
      order by p.name asc, p.id asc
    `;
    return [...result];
  });

  return parsePartnerRows(rows);
}
