/**
 * The critical flow, as the database enforces it.
 *
 * Concept prototype for the CSA Rotterdam IT Committee application.
 * Fictional data only — every identity, event and ticket below is seeded.
 *
 *   admin publishes an event
 *     -> it appears to members and guests, the draft did not
 *     -> a member registers and receives a ticket at the member price
 *     -> staff scans it; a second scan is a duplicate, not a second check-in
 *     -> the dashboard numbers move
 *
 * This is the layer that runs today. The committee portal and the Expo app are
 * being written in this same wave; `admin-portal.ui.spec.ts` and
 * `member-journey.api.spec.ts` drive the same loop through them and skip until
 * they exist. What is asserted here is the part neither app is allowed to
 * reimplement: contract §5 puts the business rules inside the database, so this
 * is where the loop is actually true or false.
 *
 * It runs against a throwaway database built by global setup, never against a
 * developer's csa_dev.
 */
import { expect, test } from "@playwright/test";

import { query, queryOne, execute, expectFailure, userIdByEmail } from "./support/db";
import { DEMO, E2E_DATABASE, databaseReady } from "./support/environment";

const db = databaseReady();

/** Contract §6: 10 characters of Crockford base32, I/L/O/U excluded. */
const TICKET_CODE = /^[0123456789ABCDEFGHJKMNPQRSTVWXYZ]{10}$/;

interface EventRow {
  id: string;
  title: string;
  status: string;
  capacity: number;
  price_member_cents: number;
  price_public_cents: number;
}

interface RegistrationRow {
  id: string;
  event_id: string;
  user_id: string;
  ticket_code: string;
  price_paid_cents: number;
  is_member_price: boolean;
  payment_status: string;
  checked_in_at: string | null;
}

interface CheckInRow {
  outcome: string;
  registration_id: string | null;
  event_id: string | null;
  user_id: string | null;
  ticket_code: string | null;
  checked_in_at: string | null;
  scan_attempt_id: string;
}

test.describe("critical flow — the loop the demo rests on", () => {
  test.describe.configure({ mode: "serial" });
  test.skip(!db.ok, `${db.reason}. Run scripts/dev-setup.sh, then pnpm test:e2e.`);

  let admin = "";
  let member = "";
  let nonMember = "";
  let staff = "";
  let event: EventRow;
  let memberTicket: RegistrationRow;

  test.beforeAll(() => {
    admin = userIdByEmail(DEMO.admin);
    member = userIdByEmail(DEMO.member);
    nonMember = userIdByEmail(DEMO.nonMember);
    staff = userIdByEmail(DEMO.staff);
  });

  test("the seed provides the four demo identities with the contracted roles", () => {
    const roles = query<{ email: string; role: string }>(
      `select email, role from public.users
        where email in ('${DEMO.member}','${DEMO.nonMember}','${DEMO.admin}','${DEMO.staff}')
        order by email`,
      { role: "owner" },
    );
    expect(roles).toHaveLength(4);
    expect(Object.fromEntries(roles.map((r) => [r.email, r.role]))).toEqual({
      [DEMO.admin]: "admin",
      [DEMO.staff]: "staff",
      // Contract §2: role governs permissions only. The member's member-ness
      // comes from an active membership period, not from this column.
      [DEMO.member]: "attendee",
      [DEMO.nonMember]: "attendee",
    });

    const active = query(
      `select id from public.membership_periods
        where user_id = '${member}' and status = 'active'
          and now() between starts_at and expires_at`,
      { role: "owner" },
    );
    expect(active, `${DEMO.member} must hold an active membership`).toHaveLength(1);
    expect(
      query(
        `select id from public.membership_periods
              where user_id = '${nonMember}' and status = 'active'
                and now() between starts_at and expires_at`,
        { role: "owner" },
      ),
      `${DEMO.nonMember} must not`,
    ).toHaveLength(0);
  });

  test("a draft event is invisible to everyone but staff", () => {
    event = queryOne<EventRow>(
      `select id, title, status, capacity, price_member_cents, price_public_cents
         from public.events where status = 'draft' order by starts_at limit 1`,
      { role: "owner" },
    );

    // Guests and members see only published events (contract §11).
    expect(query(`select id from public.events where id = '${event.id}'`)).toHaveLength(0);
    expect(
      query(`select id from public.events where id = '${event.id}'`, { as: member }),
    ).toHaveLength(0);
    // Staff see it, which is how a committee member finds it to publish.
    expect(
      query(`select id from public.events where id = '${event.id}'`, { as: staff }),
    ).toHaveLength(1);
  });

  test("an attendee cannot publish an event; an admin can", () => {
    // RLS filters rather than errors, so the proof is that nothing changed.
    execute(`update public.events set status = 'published' where id = '${event.id}'`, {
      as: member,
    });
    expect(
      queryOne<EventRow>(`select status from public.events where id = '${event.id}'`, {
        role: "owner",
      }).status,
      "an attendee must not be able to publish",
    ).toBe("draft");

    execute(`update public.events set status = 'published' where id = '${event.id}'`, {
      as: admin,
    });
    expect(
      queryOne<EventRow>(`select status from public.events where id = '${event.id}'`, {
        role: "owner",
      }).status,
    ).toBe("published");
  });

  test("the published event now appears to a member and to a guest", () => {
    const asMember = query<EventRow>(
      `select id, title from public.events where id = '${event.id}'`,
      { as: member },
    );
    expect(asMember, "a member must see the event the admin just published").toHaveLength(1);
    expect(asMember[0]?.title).toBe(event.title);

    expect(
      query(`select id from public.events where id = '${event.id}'`),
      "a guest must see it too — discovery does not require an account",
    ).toHaveLength(1);
  });

  test("a member registers and receives a ticket at the member price", () => {
    memberTicket = queryOne<RegistrationRow>(
      `select * from public.register_for_event('${event.id}', '${member}')`,
      { as: member },
    );

    expect(memberTicket.event_id).toBe(event.id);
    expect(memberTicket.user_id).toBe(member);
    expect(memberTicket.ticket_code, "contract §6: Crockford base32, 10 chars").toMatch(
      TICKET_CODE,
    );
    expect(memberTicket.is_member_price, "an active membership must set the member price").toBe(
      true,
    );
    expect(memberTicket.price_paid_cents).toBe(event.price_member_cents);
    expect(memberTicket.checked_in_at).toBeNull();
    // Contract §5 step 7: paid when free, pending otherwise.
    expect(memberTicket.payment_status).toBe(event.price_member_cents === 0 ? "paid" : "pending");

    // The ticket code is not derived from any id.
    expect(memberTicket.ticket_code).not.toContain(memberTicket.id.slice(0, 6).toUpperCase());
  });

  test("the same person cannot take two places", () => {
    expect(
      expectFailure(`select * from public.register_for_event('${event.id}', '${member}')`, {
        as: member,
      }),
    ).toContain("already_registered");
  });

  test("a non-member registering for the same event pays the public price", () => {
    const ticket = queryOne<RegistrationRow>(
      `select * from public.register_for_event('${event.id}', '${nonMember}')`,
      { as: nonMember },
    );
    expect(ticket.is_member_price).toBe(false);
    expect(ticket.price_paid_cents).toBe(event.price_public_cents);
    expect(ticket.ticket_code).toMatch(TICKET_CODE);
    expect(ticket.ticket_code, "ticket codes are unique").not.toBe(memberTicket.ticket_code);
  });

  test("a ticket is visible to its owner and to staff, and to nobody else", () => {
    expect(
      query(`select id from public.registrations where id = '${memberTicket.id}'`, { as: member }),
    ).toHaveLength(1);
    expect(
      query(`select id from public.registrations where id = '${memberTicket.id}'`, { as: staff }),
    ).toHaveLength(1);
    expect(
      query(`select id from public.registrations where id = '${memberTicket.id}'`, {
        as: nonMember,
      }),
      "another attendee must not be able to read someone else's ticket",
    ).toHaveLength(0);
  });

  test("an attendee cannot check anyone in", () => {
    expect(
      expectFailure(
        `select * from public.check_in_ticket('${memberTicket.ticket_code}', '${event.id}', now(), 'e2e-attendee-device')`,
        { as: member },
      ),
      "contract §5: check-in is staff and admin only",
    ).toContain("forbidden");
  });

  test("staff check the ticket in at the door", () => {
    const result = queryOne<CheckInRow>(
      `select * from public.check_in_ticket('${memberTicket.ticket_code}', '${event.id}', now(), 'e2e-door-scanner')`,
      { as: staff },
    );
    expect(result.outcome).toBe("success");
    expect(result.registration_id).toBe(memberTicket.id);
    expect(result.ticket_code).toBe(memberTicket.ticket_code);
    expect(result.checked_in_at).not.toBeNull();
    expect(
      result.scan_attempt_id,
      "every scan is recorded before anything is decided",
    ).toBeTruthy();
  });

  test("a second scan is a duplicate returning the original time, not a second check-in", () => {
    const first = queryOne<{ checked_in_at: string }>(
      `select checked_in_at from public.registrations where id = '${memberTicket.id}'`,
      { role: "owner" },
    );

    const again = queryOne<CheckInRow>(
      `select * from public.check_in_ticket('${memberTicket.ticket_code}', '${event.id}', now(), 'e2e-door-scanner')`,
      { as: staff },
    );
    expect(again.outcome).toBe("duplicate");
    expect(again.checked_in_at, "a repeat scan returns the canonical time").toBe(
      first.checked_in_at,
    );

    const after = queryOne<{ checked_in_at: string }>(
      `select checked_in_at from public.registrations where id = '${memberTicket.id}'`,
      { role: "owner" },
    );
    expect(after.checked_in_at, "a later scan never moves the check-in forward").toBe(
      first.checked_in_at,
    );
  });

  test("a ticket presented at the wrong door is rejected without checking anyone in", () => {
    const other = queryOne<{ id: string }>(
      `select id from public.events where status = 'published' and id <> '${event.id}' limit 1`,
      { role: "owner" },
    );
    const wrong = queryOne<CheckInRow>(
      `select * from public.check_in_ticket('${memberTicket.ticket_code}', '${other.id}', now(), 'e2e-other-door')`,
      { as: staff },
    );
    expect(wrong.outcome).toBe("wrong_event");

    const unknown = queryOne<CheckInRow>(
      `select * from public.check_in_ticket('ZZZZZZZZZZ', '${event.id}', now(), 'e2e-door-scanner')`,
      { as: staff },
    );
    expect(unknown.outcome).toBe("invalid");
    expect(unknown.registration_id).toBeNull();
    expect(unknown.scan_attempt_id, "a rejection is still evidence").toBeTruthy();
  });

  test("every scan, including the rejections, is in the evidence log", () => {
    const attempts = query<{ outcome: string }>(
      `select outcome from public.scan_attempts
        where device_id like 'e2e-%' order by received_at`,
      { as: staff },
    );
    // success, duplicate, wrong_event, invalid — the closed enum, end to end.
    // The attendee's forbidden attempt raised before any row was written.
    expect(attempts.map((a) => a.outcome)).toEqual([
      "success",
      "duplicate",
      "wrong_event",
      "invalid",
    ]);
  });

  test("the dashboard numbers move", () => {
    const summary = queryOne<{
      registered: number;
      spots_remaining: number;
      checked_in: number;
      member_priced: number;
      public_priced: number;
    }>(
      `select
         count(*)::int                                          as registered,
         (${event.capacity} - count(*))::int                    as spots_remaining,
         count(*) filter (where checked_in_at is not null)::int as checked_in,
         count(*) filter (where is_member_price)::int           as member_priced,
         count(*) filter (where not is_member_price)::int       as public_priced
       from public.registrations where event_id = '${event.id}'`,
      { as: admin },
    );

    expect(summary.registered).toBe(2);
    expect(summary.spots_remaining).toBe(event.capacity - 2);
    expect(summary.checked_in).toBe(1);
    expect(summary.member_priced).toBe(1);
    expect(summary.public_priced).toBe(1);
  });

  test("the registration is on the audit trail", () => {
    const audit = query<{ action: string; entity_id: string }>(
      `select action, entity_id from public.audit_events
        where entity_id = '${memberTicket.id}'`,
      { as: admin },
    );
    expect(
      audit.length,
      "contract §5 step 8: register_for_event writes an audit row",
    ).toBeGreaterThan(0);
  });

  test("capacity holds: the seeded single-seat event sells exactly one place", () => {
    // The demo's capacity fixture, seeded at capacity 1. The N-way proof under
    // real concurrency is supabase/tests/run_concurrency_test.sh; this asserts
    // the same rule on the sequential path the UI actually takes.
    const single = queryOne<EventRow>(
      `select id, capacity from public.events
        where status = 'published' and capacity = 1
          and registration_deadline_at > now() limit 1`,
      { role: "owner" },
    );
    expect(single.capacity).toBe(1);
    expect(
      query(`select id from public.registrations where event_id = '${single.id}'`, {
        role: "owner",
      }),
      "reset-db.sh must leave the capacity-1 fixture untouched",
    ).toHaveLength(0);

    const won = queryOne<RegistrationRow>(
      `select * from public.register_for_event('${single.id}', '${member}')`,
      { as: member },
    );
    expect(won.ticket_code).toMatch(TICKET_CODE);

    expect(
      expectFailure(`select * from public.register_for_event('${single.id}', '${nonMember}')`, {
        as: nonMember,
      }),
      "contract §5 step 4: the second caller is rejected with event_full",
    ).toContain("event_full");
  });

  test("the suite ran against its own throwaway database", () => {
    expect(E2E_DATABASE).not.toBe("csa_dev");
  });
});
