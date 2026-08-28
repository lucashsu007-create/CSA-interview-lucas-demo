/**
 * Support for the integration tests.
 *
 * The tests in this package talk to a real PostgreSQL loaded with
 * `supabase/migrations` and `supabase/seed.sql`, because the thing worth proving
 * is that the SQL is right — a mock of `postgres` would prove that the mock
 * agrees with itself. Two rules follow from that:
 *
 *   - if the database is unreachable the suite skips instead of failing, so
 *     `pnpm test` still passes on a machine with no server;
 *   - every row a test creates is deleted again, so the seed a demo depends on
 *     survives the suite. {@link purge} is the only place that writes with the
 *     connection's own privileges, and it exists solely to undo test writes.
 */

import type { Uuid } from "@csa/domain";

import { closeDb, getDb } from "../db";

/** Long enough for a warm local socket, short enough not to stall a suite. */
const PROBE_TIMEOUT_MS = 5_000;

export interface DemoIdentities {
  readonly member: Uuid;
  readonly nonMember: Uuid;
  readonly admin: Uuid;
  readonly staff: Uuid;
}

export interface SeededEvent {
  readonly id: Uuid;
  readonly title: string;
  readonly capacity: number;
  readonly priceMemberCents: number;
  readonly pricePublicCents: number;
  readonly status: string;
}

/** Seeded events these tests lean on, by title. */
export const EVENT_TITLES = {
  /** Capacity 1, free, no registrations. The capacity race fixture. */
  singleSeat: "[DEMO ONLY] Concurrency Test - Single Seat",
  /** 500 member / 900 public, plenty of room, neither demo identity registered. */
  pricing: "Chinese Calligraphy Workshop",
  /** Spare event with room, for a second registration in the same test file. */
  spare: "Thesis Writing Bootcamp",
  /** `draft` — invisible to guests and attendees, visible to staff and admin. */
  draft: "Winter Ski Weekend (Sauerland)",
  /** `sold_out` — hidden by `events_read_published` even from ticket holders. */
  soldOut: "Dim Sum Brunch at Katendrecht",
  /** `cancelled`, and `member@demo.local` holds a refunded ticket for it. */
  cancelled: "Spring Boat Cruise on the Maas",
} as const;

/**
 * True when a seeded database is reachable.
 *
 * Races a short timer so an unreachable host skips in seconds rather than
 * waiting out the driver's 30-second connect timeout, and closes the pool it
 * opened so a failed probe leaves nothing behind.
 */
export async function databaseAvailable(): Promise<boolean> {
  const timeout = new Promise<never>((_resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("probe timed out")), PROBE_TIMEOUT_MS);
    timer.unref?.();
  });

  try {
    await Promise.race([getDb()`select 1 from users limit 1`, timeout]);
    return true;
  } catch {
    await closeDb().catch(() => undefined);
    return false;
  }
}

export async function loadDemoIdentities(): Promise<DemoIdentities> {
  const rows = await getDb()`
    select u.id, u.email::text as email
    from users u
    where u.email::text in (
      'member@demo.local', 'nonmember@demo.local', 'admin@demo.local', 'staff@demo.local'
    )
  `;

  const byEmail = new Map(rows.map((row) => [row["email"] as string, row["id"] as Uuid]));
  const require_ = (email: string): Uuid => {
    const id = byEmail.get(email);
    if (id === undefined) throw new Error(`seed is missing ${email}`);
    return id;
  };

  return {
    member: require_("member@demo.local"),
    nonMember: require_("nonmember@demo.local"),
    admin: require_("admin@demo.local"),
    staff: require_("staff@demo.local"),
  };
}

export async function loadSeededEvent(title: string): Promise<SeededEvent> {
  const rows = await getDb()`
    select e.id, e.title, e.capacity, e.price_member_cents, e.price_public_cents, e.status::text
    from events e
    where e.title = ${title}
  `;

  const row = rows[0];
  if (row === undefined) throw new Error(`seed is missing the event ${JSON.stringify(title)}`);

  return {
    id: row["id"] as Uuid,
    title: row["title"] as string,
    capacity: row["capacity"] as number,
    priceMemberCents: row["price_member_cents"] as number,
    pricePublicCents: row["price_public_cents"] as number,
    status: row["status"] as string,
  };
}

/**
 * Removes everything a test created.
 *
 * `payments` disappears with its registration through `on delete cascade`;
 * `scan_attempts` and `audit_events` deliberately have no foreign keys (they are
 * evidence logs that must be able to record a scan of a ticket that does not
 * exist), so they are cleaned by ticket code and entity id instead.
 */
export async function purge(target: {
  registrationIds?: readonly Uuid[];
  ticketCodes?: readonly string[];
}): Promise<void> {
  const registrationIds = [...(target.registrationIds ?? [])];
  const ticketCodes = [...(target.ticketCodes ?? [])];
  if (registrationIds.length === 0 && ticketCodes.length === 0) return;

  await getDb().begin(async (sql) => {
    if (registrationIds.length > 0) {
      const rows = await sql`
        select r.ticket_code from registrations r where r.id = any(${registrationIds}::uuid[])
      `;
      for (const row of rows) ticketCodes.push(row["ticket_code"] as string);
    }

    if (ticketCodes.length > 0) {
      await sql`delete from scan_attempts where ticket_code = any(${ticketCodes}::text[])`;
    }

    if (registrationIds.length > 0) {
      await sql`
        delete from audit_events
        where entity_type = 'registration' and entity_id = any(${registrationIds}::uuid[])
      `;
      await sql`delete from registrations where id = any(${registrationIds}::uuid[])`;
    }
  });
}
