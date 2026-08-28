/**
 * Contract §12 — the event reads.
 *
 * `EventListItem` carries `registeredCount` and `spotsRemaining` so no screen
 * computes capacity itself. Both are counted in SQL, and neither is
 * authoritative for *whether* a registration will succeed: only the
 * `SELECT ... FOR UPDATE` inside `register_for_event` is. These numbers are what
 * a card renders; the server is still the referee.
 */

import { isEventCategory } from "@csa/domain";
import type { CsaEvent, EventCategory, Registration, Uuid } from "@csa/domain";
import { parseEventRows, parseRegistrationRow, uuidSchema } from "@csa/validation";

import { withPrivilegedRead, withSession } from "./db";
import type { Sql } from "./db";

/** An event with its live capacity. */
export interface EventListItem extends CsaEvent {
  /** Registrations held against this event, whatever their payment status. */
  readonly registeredCount: number;
  /** `capacity - registeredCount`, floored at zero. */
  readonly spotsRemaining: number;
}

/** One event, plus whether the caller already holds a ticket for it. */
export interface EventDetail extends EventListItem {
  /**
   * The caller's own registration, or null. Always null for a guest, and never
   * somebody else's registration even for staff — the button on the page is
   * about the person looking at it.
   */
  readonly viewerRegistration: Registration | null;
}

/**
 * The `events` column list, once.
 *
 * `description` and `location` are nullable in the schema but non-null in
 * `eventRowSchema`, so they are coalesced here rather than being allowed to
 * blow up the parser on a half-filled draft.
 */
export function eventColumns(sql: Sql) {
  return sql`
    e.id,
    e.title,
    coalesce(e.description, '') as description,
    e.category,
    coalesce(e.location, '') as location,
    e.starts_at,
    e.registration_deadline_at,
    e.capacity,
    e.price_member_cents,
    e.price_public_cents,
    e.status,
    e.image_url,
    e.created_at
  `;
}

/**
 * Places taken per event.
 *
 * Elevated on purpose — see `PrivilegedReadReason`. `anon` has no SELECT on
 * `registrations` at all and an attendee sees only their own rows, so counting
 * this under the caller's session would error for a guest and under-count for
 * everyone else. Only `(event_id, count)` leaves this query.
 */
export async function registrationCountsByEvent(
  eventIds: readonly Uuid[],
): Promise<Map<Uuid, number>> {
  const counts = new Map<Uuid, number>();
  if (eventIds.length === 0) return counts;

  const rows = await withPrivilegedRead("public-event-capacity", async (sql) => {
    const result = await sql`
      select r.event_id, count(*)::int as registered_count
      from registrations r
      where r.event_id = any(${[...eventIds]}::uuid[])
      group by r.event_id
    `;
    return [...result];
  });

  for (const row of rows) {
    counts.set(row["event_id"] as Uuid, row["registered_count"] as number);
  }
  return counts;
}

export function toEventListItem(event: CsaEvent, registeredCount: number): EventListItem {
  return {
    ...event,
    registeredCount,
    spotsRemaining: Math.max(event.capacity - registeredCount, 0),
  };
}

/** Attaches live capacity to a batch of events in one round trip. */
export async function withCapacity(events: readonly CsaEvent[]): Promise<EventListItem[]> {
  const counts = await registrationCountsByEvent(events.map((event) => event.id));
  return events.map((event) => toEventListItem(event, counts.get(event.id) ?? 0));
}

/**
 * Every published event, soonest first.
 *
 * Deliberately not filtered to the future. The contract froze the filter at
 * `{ category? }`, and a data layer that silently dropped rows a caller asked
 * for would be the harder bug to find — a screen that wants only what is coming
 * up can compare `startsAt`, but it cannot recover what was never returned.
 *
 * The `status = 'published'` predicate is this function's own semantics, not a
 * re-implementation of RLS: staff and admin sessions can see drafts, and
 * `listPublishedEvents` still must not return them.
 */
export async function listPublishedEvents(
  as: Uuid | null,
  filter?: { category?: EventCategory },
): Promise<EventListItem[]> {
  const category = filter?.category ?? null;
  if (category !== null && !isEventCategory(category)) {
    throw new TypeError(`unknown event category: ${String(category)}`);
  }

  const rows = await withSession(as, async (sql) => {
    const result = await sql`
      select ${eventColumns(sql)}
      from events e
      where e.status = 'published'
        and (${category}::text is null or e.category::text = ${category}::text)
      order by e.starts_at asc, e.id asc
    `;
    return [...result];
  });

  return withCapacity(parseEventRows(rows));
}

/**
 * One event, or null when the caller may not see it.
 *
 * No status filter here: RLS decides. A guest or an attendee asking for a draft
 * gets null; staff and admin get the row. That difference is the whole point of
 * the session mechanism, so it is left to the policies rather than reproduced in
 * a `where` clause.
 */
export async function getEvent(as: Uuid | null, eventId: Uuid): Promise<EventDetail | null> {
  const id = uuidSchema.parse(eventId);

  const found = await withSession(as, async (sql) => {
    const eventRows = await sql`
      select ${eventColumns(sql)}
      from events e
      where e.id = ${id}::uuid
    `;
    const eventRow = eventRows[0];
    if (eventRow === undefined) return null;

    if (as === null) return { eventRow, registrationRow: null };

    const registrationRows = await sql`
      select r.*
      from registrations r
      where r.event_id = ${id}::uuid
        and r.user_id = ${as}::uuid
    `;
    return { eventRow, registrationRow: registrationRows[0] ?? null };
  });

  if (found === null) return null;

  const [event] = parseEventRows([found.eventRow]);
  if (event === undefined) return null;

  const [listItem] = await withCapacity([event]);
  if (listItem === undefined) return null;

  return {
    ...listItem,
    viewerRegistration:
      found.registrationRow === null ? null : parseRegistrationRow(found.registrationRow),
  };
}
