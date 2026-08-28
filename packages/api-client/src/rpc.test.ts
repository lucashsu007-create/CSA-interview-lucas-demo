/**
 * Contract §5 — the two functions that carry the demo.
 *
 * Every assertion below is about behaviour that lives inside the database, which
 * is why these are integration tests: a mocked driver would only prove that the
 * mock agrees with the mock. Everything they create is deleted again in
 * `afterEach`, and `afterAll` checks that nothing was left behind.
 */

import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { closeDb, getDb } from "./db";
import { getEvent } from "./events";
import {
  CSA_ERROR_TOKENS,
  CsaError,
  checkInTicket,
  isCsaError,
  isCsaErrorToken,
  normalizeCheckInResultRow,
  registerForEvent,
  toCsaError,
} from "./rpc";
import {
  EVENT_TITLES,
  databaseAvailable,
  loadDemoIdentities,
  loadSeededEvent,
  purge,
} from "./__fixtures__/integration";
import type { DemoIdentities, SeededEvent } from "./__fixtures__/integration";

const DEVICE_ID = "vitest-scanner-01";

/* -------------------------------------------------------------------------- */
/* Error mapping — no database needed                                         */
/* -------------------------------------------------------------------------- */

describe("toCsaError", () => {
  const raised = (code: string, message: string, detail = "a human sentence"): unknown =>
    Object.assign(new Error(message), { code, detail, severity: "ERROR" });

  it("maps the three codes the domain union carries", () => {
    for (const [sqlState, token] of [
      ["CSA01", "event_not_published"],
      ["CSA02", "registration_closed"],
      ["CSA03", "event_full"],
    ] as const) {
      const error = toCsaError(raised(sqlState, token));
      expect(error?.code).toBe(token);
      expect(error?.sqlState).toBe(sqlState);
      expect(error?.registrationErrorCode).toBe(token);
      expect(error?.detail).toBe("a human sentence");
    }
  });

  it("maps already_registered through both fields now that it has a seat", () => {
    // It and `forbidden` had HTTP mappings in contract §13 but no seat in
    // `RegistrationErrorCode`, so this used to assert null. Two workstreams hit
    // that gap independently; the union gained both values at integration.
    const error = toCsaError(raised("CSA05", "already_registered"));
    expect(error?.code).toBe("already_registered");
    expect(error?.registrationErrorCode).toBe("already_registered");
    expect(isCsaErrorToken(error?.code)).toBe(true);
  });

  it("treats a missing EXECUTE grant as forbidden", () => {
    const error = toCsaError(raised("42501", "permission denied for function register_for_event"));
    expect(error?.code).toBe("forbidden");
    expect(error?.registrationErrorCode).toBeNull();
  });

  it("leaves anything that is not a named failure alone", () => {
    expect(toCsaError(raised("23505", "duplicate key value"))).toBeNull();
    expect(toCsaError(new Error("socket hang up"))).toBeNull();
    expect(toCsaError("nonsense")).toBeNull();
    expect(toCsaError(null)).toBeNull();
  });

  it("is idempotent", () => {
    const error = toCsaError(raised("CSA03", "event_full"));
    expect(toCsaError(error)).toBe(error);
    expect(isCsaError(error)).toBe(true);
  });

  it("lists exactly the tokens contract §5 defines", () => {
    expect([...CSA_ERROR_TOKENS]).toEqual([
      "invalid_arguments",
      "event_not_published",
      "registration_closed",
      "event_full",
      "event_not_found",
      "already_registered",
      "ticket_code_exhausted",
      "user_not_found",
      "forbidden",
    ]);
  });
});

describe("normalizeCheckInResultRow", () => {
  it("clears the scanned code when there is no registration behind it", () => {
    // `check_in_ticket` returns the scanned code on an `invalid` outcome while
    // the three registration columns are null, and `checkInTicketResultSchema`
    // refuses a half-populated ticket. No registration id means no ticket.
    expect(
      normalizeCheckInResultRow({
        outcome: "invalid",
        registration_id: null,
        event_id: null,
        user_id: null,
        ticket_code: "N0TAC0DE",
        checked_in_at: null,
        scan_attempt_id: "00000000-0000-0000-0000-0000000000aa",
      }),
    ).toEqual({
      outcome: "invalid",
      registration_id: null,
      event_id: null,
      user_id: null,
      ticket_code: null,
      checked_in_at: null,
      scan_attempt_id: "00000000-0000-0000-0000-0000000000aa",
    });
  });

  it("leaves a populated row exactly as it was", () => {
    const row = {
      outcome: "wrong_event",
      registration_id: "00000000-0000-0000-0000-0000000000b1",
      event_id: "00000000-0000-0000-0000-0000000000b2",
      user_id: "00000000-0000-0000-0000-0000000000b3",
      ticket_code: "QMR3AEXVNG",
      checked_in_at: null,
      scan_attempt_id: "00000000-0000-0000-0000-0000000000b4",
    };
    expect(normalizeCheckInResultRow(row)).toEqual(row);
  });

  it("passes anything that is not a row straight through", () => {
    expect(normalizeCheckInResultRow(null)).toBeNull();
  });
});

/* -------------------------------------------------------------------------- */
/* Against the seeded database                                                */
/* -------------------------------------------------------------------------- */

const available = await databaseAvailable();

describe.skipIf(!available)("register_for_event and check_in_ticket", () => {
  let who: DemoIdentities;
  let pricing: SeededEvent;
  let spare: SeededEvent;
  let singleSeat: SeededEvent;
  let draft: SeededEvent;

  /** Everything created by the test that is currently running. */
  let createdRegistrationIds: string[] = [];
  let scannedTicketCodes: string[] = [];
  const everCreated: string[] = [];

  beforeAll(async () => {
    who = await loadDemoIdentities();
    pricing = await loadSeededEvent(EVENT_TITLES.pricing);
    spare = await loadSeededEvent(EVENT_TITLES.spare);
    singleSeat = await loadSeededEvent(EVENT_TITLES.singleSeat);
    draft = await loadSeededEvent(EVENT_TITLES.draft);
  });

  afterEach(async () => {
    await purge({ registrationIds: createdRegistrationIds, ticketCodes: scannedTicketCodes });
    createdRegistrationIds = [];
    scannedTicketCodes = [];
  });

  afterAll(async () => {
    if (everCreated.length > 0) {
      const [row] = await getDb()`
        select count(*)::int as n from registrations where id = any(${everCreated}::uuid[])
      `;
      expect(row?.["n"], "the suite must leave the seed exactly as it found it").toBe(0);
    }
    await closeDb();
  });

  const track = <T extends { id: string }>(registration: T): T => {
    createdRegistrationIds.push(registration.id);
    everCreated.push(registration.id);
    return registration;
  };

  it("charges the member price to a member and the public price to everybody else", async () => {
    // Contract §2: the price comes from an active membership period, never from
    // `users.role`. Both callers here are role `attendee`.
    expect(pricing.priceMemberCents).not.toBe(pricing.pricePublicCents);

    const asMember = track(await registerForEvent(who.member, pricing.id));
    expect(asMember.pricePaidCents).toBe(pricing.priceMemberCents);
    expect(asMember.isMemberPrice).toBe(true);
    expect(asMember.paymentStatus).toBe("pending");
    expect(asMember.ticketCode).toMatch(/^[0-9ABCDEFGHJKMNPQRSTVWXYZ]{10}$/);
    expect(asMember.checkedInAt).toBeNull();

    const asNonMember = track(await registerForEvent(who.nonMember, pricing.id));
    expect(asNonMember.pricePaidCents).toBe(pricing.pricePublicCents);
    expect(asNonMember.isMemberPrice).toBe(false);

    // Non-sequential and unique: two codes drawn a moment apart share nothing.
    expect(asNonMember.ticketCode).not.toBe(asMember.ticketCode);
  });

  it("pays a free event on issue rather than leaving it pending", async () => {
    expect(singleSeat.priceMemberCents).toBe(0);
    const free = track(await registerForEvent(who.member, singleSeat.id));
    expect(free.pricePaidCents).toBe(0);
    expect(free.paymentStatus).toBe("paid");
  });

  it("raises already_registered on a second attempt at the same event", async () => {
    track(await registerForEvent(who.member, pricing.id));

    const error = await registerForEvent(who.member, pricing.id).catch((caught: unknown) => caught);

    expect(isCsaError(error)).toBe(true);
    expect((error as CsaError).code).toBe("already_registered");
    expect((error as CsaError).sqlState).toBe("CSA05");
    // It sat outside the domain union until integration, so this asserted null.
    // The union gained the value once two workstreams hit the gap separately.
    expect((error as CsaError).registrationErrorCode).toBe("already_registered");
  });

  it("fills the single-seat fixture once and then raises event_full", async () => {
    const before = await getEvent(who.admin, singleSeat.id);
    expect(
      before?.spotsRemaining,
      'the single-seat fixture must start free — the seed says "Leave the seat free"',
    ).toBe(1);

    const winner = track(await registerForEvent(who.member, singleSeat.id));
    expect(winner.eventId).toBe(singleSeat.id);

    const error = await registerForEvent(who.nonMember, singleSeat.id).catch(
      (caught: unknown) => caught,
    );

    expect(isCsaError(error)).toBe(true);
    expect((error as CsaError).code).toBe("event_full");
    expect((error as CsaError).sqlState).toBe("CSA03");
    expect((error as CsaError).registrationErrorCode).toBe("event_full");

    const after = await getEvent(who.admin, singleSeat.id);
    expect(after?.registeredCount).toBe(1);
    expect(after?.spotsRemaining).toBe(0);
  });

  it("refuses a draft event and a closed deadline, mapped to the domain union", async () => {
    const notPublished = await registerForEvent(who.member, draft.id).catch(
      (caught: unknown) => caught,
    );
    expect((notPublished as CsaError).code).toBe("event_not_published");
    expect((notPublished as CsaError).registrationErrorCode).toBe("event_not_published");

    // A seeded event whose deadline is already in the past.
    const past = await loadSeededEvent("Dumpling Making Workshop");
    const closed = await registerForEvent(who.nonMember, past.id).catch(
      (caught: unknown) => caught,
    );
    expect((closed as CsaError).code).toBe("registration_closed");
    expect((closed as CsaError).registrationErrorCode).toBe("registration_closed");
  });

  it("checks a ticket in once and reports every later scan as a duplicate", async () => {
    const ticket = track(await registerForEvent(who.member, spare.id));

    const first = await checkInTicket(who.staff, {
      ticketCode: ticket.ticketCode,
      eventId: spare.id,
      scannedAt: new Date(),
      deviceId: DEVICE_ID,
    });

    expect(first.outcome).toBe("success");
    if (first.outcome !== "success") throw new Error("unreachable");
    expect(first.ticket.ticketCode).toBe(ticket.ticketCode);
    expect(first.ticket.registrationId).toBe(ticket.id);
    expect(first.ticket.userId).toBe(who.member);
    expect(first.scanAttemptId).toBeTruthy();

    const second = await checkInTicket(who.staff, {
      ticketCode: ticket.ticketCode,
      eventId: spare.id,
      scannedAt: new Date(),
      deviceId: DEVICE_ID,
    });

    expect(second.outcome).toBe("duplicate");
    if (second.outcome !== "duplicate") throw new Error("unreachable");
    // The canonical time, not a second check-in.
    expect(second.checkedInAt.getTime()).toBe(first.checkedInAt.getTime());
    expect(second.scanAttemptId).not.toBe(first.scanAttemptId);
  });

  it("lets a queued offline scan correct the canonical time downward, never upward", async () => {
    // Contract §5: `checked_in_at := least(stored, new)`. A scan that syncs late
    // but reports an earlier time is when the person actually walked in.
    const ticket = track(await registerForEvent(who.member, spare.id));

    const first = await checkInTicket(who.staff, {
      ticketCode: ticket.ticketCode,
      eventId: spare.id,
      scannedAt: new Date(),
      deviceId: DEVICE_ID,
    });
    if (first.outcome !== "success") throw new Error("expected the first scan to succeed");

    const earlier = new Date(first.checkedInAt.getTime() - 60 * 60 * 1000);
    const queued = await checkInTicket(who.staff, {
      ticketCode: ticket.ticketCode,
      eventId: spare.id,
      scannedAt: earlier,
      deviceId: "vitest-scanner-offline",
    });
    expect(queued.outcome).toBe("duplicate");
    if (queued.outcome !== "duplicate") throw new Error("unreachable");
    expect(queued.checkedInAt.getTime()).toBe(earlier.getTime());

    const later = await checkInTicket(who.staff, {
      ticketCode: ticket.ticketCode,
      eventId: spare.id,
      scannedAt: new Date(earlier.getTime() + 30 * 60 * 1000),
      deviceId: DEVICE_ID,
    });
    if (later.outcome !== "duplicate") throw new Error("unreachable");
    expect(later.checkedInAt.getTime()).toBe(earlier.getTime());
  });

  it("rejects a ticket presented at the wrong event without checking anyone in", async () => {
    const ticket = track(await registerForEvent(who.member, spare.id));

    const scan = await checkInTicket(who.staff, {
      ticketCode: ticket.ticketCode,
      eventId: pricing.id,
      scannedAt: new Date(),
      deviceId: DEVICE_ID,
    });

    expect(scan.outcome).toBe("wrong_event");
    if (scan.outcome !== "wrong_event") throw new Error("unreachable");
    expect(scan.ticket?.eventId).toBe(spare.id);
    expect(scan.scanAttemptId).toBeTruthy();

    const [row] = await getDb()`
      select checked_in_at from registrations where id = ${ticket.id}::uuid
    `;
    expect(row?.["checked_in_at"]).toBeNull();
  });

  it("records an unknown code as invalid and still logs the scan", async () => {
    scannedTicketCodes.push("ZZZZZZZZZZ");

    const scan = await checkInTicket(who.staff, {
      ticketCode: "ZZZZZZZZZZ",
      eventId: spare.id,
      scannedAt: new Date(),
      deviceId: DEVICE_ID,
    });

    expect(scan).toEqual({ outcome: "invalid", scanAttemptId: scan.scanAttemptId });

    const [row] = await getDb()`
      select ticket_code, outcome::text as outcome
      from scan_attempts where id = ${scan.scanAttemptId}::uuid
    `;
    expect(row?.["ticket_code"]).toBe("ZZZZZZZZZZ");
    expect(row?.["outcome"]).toBe("invalid");
  });

  it("sends a garbled code to the database rather than refusing it locally", async () => {
    // "Every scan is recorded, whatever the outcome" is a database guarantee. A
    // client that refused to forward a bad badge would be the one breaking it,
    // and the evidence row for a bad badge is the one worth having.
    scannedTicketCodes.push("N0TAC0DE");

    const scan = await checkInTicket(who.staff, {
      ticketCode: "not-a-code",
      eventId: spare.id,
      scannedAt: new Date(),
      deviceId: DEVICE_ID,
    });

    expect(scan.outcome).toBe("invalid");

    const [row] = await getDb()`
      select ticket_code from scan_attempts where id = ${scan.scanAttemptId}::uuid
    `;
    // Crockford normalisation: hyphen dropped, O -> 0, uppercased.
    expect(row?.["ticket_code"]).toBe("N0TAC0DE");
  });

  it("refuses check-in to anyone who is not staff or admin", async () => {
    const ticket = track(await registerForEvent(who.member, spare.id));

    const error = await checkInTicket(who.member, {
      ticketCode: ticket.ticketCode,
      eventId: spare.id,
      scannedAt: new Date(),
      deviceId: DEVICE_ID,
    }).catch((caught: unknown) => caught);

    expect(isCsaError(error)).toBe(true);
    expect((error as CsaError).code).toBe("forbidden");
    expect((error as CsaError).sqlState).toBe("CSA42");

    const [row] = await getDb()`
      select checked_in_at from registrations where id = ${ticket.id}::uuid
    `;
    expect(row?.["checked_in_at"]).toBeNull();
  });

  it("writes an audit row for every registration it creates", async () => {
    const registration = track(await registerForEvent(who.member, pricing.id));

    const [row] = await getDb()`
      select action, metadata
      from audit_events
      where entity_type = 'registration' and entity_id = ${registration.id}::uuid
    `;
    expect(row?.["action"]).toBe("registration_created");
    expect((row?.["metadata"] as Record<string, unknown>)["ticket_code"]).toBe(
      registration.ticketCode,
    );
  });
});
