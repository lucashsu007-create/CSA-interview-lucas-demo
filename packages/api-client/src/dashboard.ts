/**
 * Contract §12 — the committee dashboard.
 *
 * "upcoming events, registrations today, capacity used, member/non-member split,
 * and recent check-ins — the fields the demo plan's dashboard names, and nothing
 * else." The demo plan also lists mock revenue; the contract dropped it, and the
 * contract wins.
 *
 * Everything except capacity is read under the caller's own session, so RLS
 * scopes it: `staff` and `admin` get the committee-wide picture, and a plain
 * attendee gets their own rows rather than an error. Capacity is the exception —
 * places taken is public information (it is what "3 spots left" means) and is
 * counted the same way for everyone, so the tile always equals the sum of the
 * list above it.
 */

import type { Uuid } from "@csa/domain";
import { parseEventRows, toDate, uuidSchema } from "@csa/validation";

import { withSession } from "./db";
import { eventColumns, withCapacity } from "./events";
import type { EventListItem } from "./events";

/** How many check-ins the dashboard shows. */
export const RECENT_CHECK_IN_LIMIT = 10;

/** Places taken against places offered, across the upcoming events. */
export interface DashboardCapacity {
  readonly capacity: number;
  readonly registered: number;
  /** `registered / capacity`, and exactly 0 when there is no capacity to use. */
  readonly usedRatio: number;
}

/**
 * Contract §2 restated as a number: the split is by the price actually charged,
 * which came from an active membership period at registration time — never from
 * `users.role`.
 */
export interface DashboardMembershipSplit {
  readonly memberPrice: number;
  readonly publicPrice: number;
  readonly total: number;
}

/** One row of the recent check-in feed. */
export interface DashboardCheckIn {
  readonly registrationId: Uuid;
  readonly ticketCode: string;
  readonly checkedInAt: Date;
  readonly eventId: Uuid;
  readonly eventTitle: string;
  readonly userId: Uuid;
  readonly userFullName: string;
}

export interface DashboardSummary {
  /** Published events that have not started yet, soonest first, with live capacity. */
  readonly upcomingEvents: EventListItem[];
  /** Registrations created since midnight in the database's own time zone. */
  readonly registrationsToday: number;
  readonly capacityUsed: DashboardCapacity;
  readonly membershipSplit: DashboardMembershipSplit;
  readonly recentCheckIns: DashboardCheckIn[];
}

function asNumber(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) {
    throw new TypeError(`expected a number, received ${String(value)}`);
  }
  return parsed;
}

function asString(value: unknown): string {
  if (typeof value !== "string") {
    throw new TypeError(`expected a string, received ${String(value)}`);
  }
  return value;
}

export async function dashboardSummary(as: Uuid): Promise<DashboardSummary> {
  const userId = uuidSchema.parse(as);

  const raw = await withSession(userId, async (sql) => {
    // Upcoming means published and not yet started. Drafts are visible to staff
    // through RLS but are not something the committee is running yet, and a
    // cancelled event is not upcoming in any useful sense.
    const upcomingRows = await sql`
      select ${eventColumns(sql)}
      from events e
      where e.status = 'published'
        and e.starts_at >= now()
      order by e.starts_at asc, e.id asc
    `;

    const [todayRow] = await sql`
      select count(*)::int as registrations_today
      from registrations r
      where r.created_at >= date_trunc('day', now())
    `;

    const [splitRow] = await sql`
      select
        (count(*) filter (where r.is_member_price))::int as member_price,
        (count(*) filter (where not r.is_member_price))::int as public_price,
        count(*)::int as total
      from registrations r
    `;

    const checkInRows = await sql`
      select
        r.id as registration_id,
        r.ticket_code,
        r.checked_in_at,
        r.event_id,
        e.title as event_title,
        r.user_id,
        u.full_name as user_full_name
      from registrations r
      join events e on e.id = r.event_id
      join users u on u.id = r.user_id
      where r.checked_in_at is not null
      order by r.checked_in_at desc, r.id asc
      limit ${RECENT_CHECK_IN_LIMIT}
    `;

    return {
      upcomingRows: [...upcomingRows],
      todayRow: todayRow ?? null,
      splitRow: splitRow ?? null,
      checkInRows: [...checkInRows],
    };
  });

  const upcomingEvents = await withCapacity(parseEventRows(raw.upcomingRows));

  const capacity = upcomingEvents.reduce((total, event) => total + event.capacity, 0);
  const registered = upcomingEvents.reduce((total, event) => total + event.registeredCount, 0);

  return {
    upcomingEvents,
    registrationsToday: asNumber(raw.todayRow?.["registrations_today"] ?? 0),
    capacityUsed: {
      capacity,
      registered,
      usedRatio: capacity === 0 ? 0 : registered / capacity,
    },
    membershipSplit: {
      memberPrice: asNumber(raw.splitRow?.["member_price"] ?? 0),
      publicPrice: asNumber(raw.splitRow?.["public_price"] ?? 0),
      total: asNumber(raw.splitRow?.["total"] ?? 0),
    },
    recentCheckIns: raw.checkInRows.map((row) => ({
      registrationId: asString(row["registration_id"]),
      ticketCode: asString(row["ticket_code"]),
      checkedInAt: toDate(asString(row["checked_in_at"])),
      eventId: asString(row["event_id"]),
      eventTitle: asString(row["event_title"]),
      userId: asString(row["user_id"]),
      userFullName: asString(row["user_full_name"]),
    })),
  };
}
