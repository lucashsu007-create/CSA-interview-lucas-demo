/**
 * Contract §12 — the tickets a caller holds.
 */

import type { CsaEvent, Registration, Uuid } from "@csa/domain";
import { parseEventRows, parseRegistrationRows, uuidSchema } from "@csa/validation";

import { withPrivilegedRead, withSession } from "./db";
import { eventColumns } from "./events";

/** A registration with the event it belongs to, for the ticket wallet. */
export interface RegistrationWithEvent extends Registration {
  readonly event: CsaEvent;
}

/**
 * Every ticket the caller holds, newest first.
 *
 * Two steps rather than one join, and the reason matters. The registrations are
 * read under the caller's session, so RLS is what limits them to their own — the
 * explicit `user_id` predicate only stops a staff or admin session from pulling
 * the whole table. The events are then read with
 * `withPrivilegedRead('own-ticket-events')`, because `events_read_published`
 * hides `sold_out` and `cancelled` events: an inner join under the session would
 * quietly drop the ticket for the brunch that sold out and the one for the boat
 * trip that was cancelled — the two tickets whose status a member most wants to
 * check. Nothing is widened beyond events the caller demonstrably holds a
 * registration for.
 */
export async function myRegistrations(as: Uuid): Promise<RegistrationWithEvent[]> {
  const userId = uuidSchema.parse(as);

  const registrationRows = await withSession(userId, async (sql) => {
    const result = await sql`
      select r.*
      from registrations r
      where r.user_id = ${userId}::uuid
      order by r.created_at desc, r.id asc
    `;
    return [...result];
  });

  const registrations = parseRegistrationRows(registrationRows);
  if (registrations.length === 0) return [];

  const eventIds = [...new Set(registrations.map((registration) => registration.eventId))];
  const eventRows = await withPrivilegedRead("own-ticket-events", async (sql) => {
    const result = await sql`
      select ${eventColumns(sql)}
      from events e
      where e.id = any(${eventIds}::uuid[])
    `;
    return [...result];
  });

  const events = new Map(parseEventRows(eventRows).map((event) => [event.id, event]));

  return registrations.flatMap((registration) => {
    const event = events.get(registration.eventId);
    // A registration whose event vanished is a foreign key violation, not a
    // display case; the FK makes it unreachable, and dropping it beats
    // inventing an event.
    return event === undefined ? [] : [{ ...registration, event }];
  });
}
