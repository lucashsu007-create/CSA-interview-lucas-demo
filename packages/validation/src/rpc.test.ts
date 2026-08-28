import { describe, expect, it } from "vitest";

import {
  checkInTicketResultSchema,
  parseCheckInTicketResult,
  parseRegisterForEventResult,
  toCheckInTicketArgs,
  toRegisterForEventArgs,
  toRegistrationErrorCode,
} from "./rpc";

const USER_ID = "00000000-0000-4000-8000-000000000001";
const EVENT_ID = "00000000-0000-4000-8000-0000000000a1";
const OTHER_EVENT_ID = "00000000-0000-4000-8000-0000000000a2";

const registrationRow = {
  id: "00000000-0000-4000-8000-0000000000c1",
  event_id: EVENT_ID,
  user_id: USER_ID,
  ticket_code: "K3M9QZ7B2T",
  price_paid_cents: 1500,
  is_member_price: true,
  payment_status: "paid",
  checked_in_at: null as string | null,
  created_at: "2026-05-01T09:00:00+00:00",
};

const checkedIn = { ...registrationRow, checked_in_at: "2026-06-01T18:05:00+00:00" };

describe("register_for_event", () => {
  it("maps camelCase input onto the p_ argument names PostgREST posts", () => {
    expect(toRegisterForEventArgs({ eventId: EVENT_ID, userId: USER_ID })).toEqual({
      p_event_id: EVENT_ID,
      p_user_id: USER_ID,
    });
  });

  it("parses a single returned row into a domain registration", () => {
    const registration = parseRegisterForEventResult(registrationRow);

    expect(registration.eventId).toBe(EVENT_ID);
    expect(registration.isMemberPrice).toBe(true);
    expect(registration.checkedInAt).toBeNull();
  });

  it("parses a one-row array too, so RETURNS versus RETURNS SETOF does not matter", () => {
    expect(parseRegisterForEventResult([registrationRow])).toEqual(
      parseRegisterForEventResult(registrationRow),
    );
  });

  it("refuses an empty result, because the function never returns null on failure", () => {
    expect(() => parseRegisterForEventResult([])).toThrow();
    expect(() => parseRegisterForEventResult(null)).toThrow();
  });

  describe("named failures", () => {
    it("recognises each contract error code wherever the driver puts it", () => {
      expect(toRegistrationErrorCode({ message: "event_full" })).toBe("event_full");
      expect(toRegistrationErrorCode({ code: "registration_closed" })).toBe("registration_closed");
      expect(toRegistrationErrorCode({ hint: "event_not_published" })).toBe("event_not_published");
      expect(
        toRegistrationErrorCode({ message: "raised exception", details: "event_full at capacity" }),
      ).toBe("event_full");
      expect(toRegistrationErrorCode("event_full")).toBe("event_full");
    });

    it("returns null for anything it does not recognise, rather than guessing", () => {
      expect(toRegistrationErrorCode({ message: "connection reset" })).toBeNull();
      expect(toRegistrationErrorCode(undefined)).toBeNull();
      expect(toRegistrationErrorCode(null)).toBeNull();
    });
  });
});

describe("check_in_ticket", () => {
  it("maps input onto the p_ argument names and sends the scan time as ISO-8601", () => {
    const args = toCheckInTicketArgs({
      ticketCode: "K3M9QZ7B2T",
      eventId: EVENT_ID,
      scannedAt: new Date("2026-06-01T18:05:00.000Z"),
      deviceId: "demo-scanner-01",
    });

    expect(args).toEqual({
      p_ticket_code: "K3M9QZ7B2T",
      p_event_id: EVENT_ID,
      p_scanned_at: "2026-06-01T18:05:00.000Z",
      p_device_id: "demo-scanner-01",
    });
  });

  // The database returns a flat `check_in_result` composite, not a nested
  // registration row. These rows are that shape.
  const scanAttemptId = "6f1d9d9e-7b0a-4a1e-9f2c-6d3a5b8c1e40";
  const flat = (over: Record<string, unknown> = {}) => ({
    outcome: "success",
    registration_id: registrationRow.id,
    event_id: EVENT_ID,
    user_id: registrationRow.user_id,
    ticket_code: "K3M9QZ7B2T",
    checked_in_at: "2026-06-01T18:05:00.000Z",
    scan_attempt_id: scanAttemptId,
    ...over,
  });

  it("parses success into a discriminated result carrying the check-in time", () => {
    const result = parseCheckInTicketResult(flat());

    expect(result.outcome).toBe("success");
    if (result.outcome !== "success") throw new Error("unreachable");
    expect(result.checkedInAt).toEqual(new Date("2026-06-01T18:05:00.000Z"));
    expect(result.ticket.ticketCode).toBe("K3M9QZ7B2T");
    expect(result.scanAttemptId).toBe(scanAttemptId);
  });

  it("parses duplicate and keeps the CANONICAL check-in time", () => {
    // Canonical, not "first seen": a queued offline scan reporting an earlier
    // time lowers this value, and the database returns what it now holds.
    const result = parseCheckInTicketResult(flat({ outcome: "duplicate" }));

    expect(result.outcome).toBe("duplicate");
    if (result.outcome !== "duplicate") throw new Error("unreachable");
    expect(result.checkedInAt).toEqual(new Date("2026-06-01T18:05:00.000Z"));
  });

  it("parses wrong_event with the ticket when the server discloses it", () => {
    const result = parseCheckInTicketResult(
      flat({ outcome: "wrong_event", event_id: OTHER_EVENT_ID, checked_in_at: null }),
    );

    expect(result.outcome).toBe("wrong_event");
    if (result.outcome !== "wrong_event") throw new Error("unreachable");
    expect(result.ticket?.eventId).toBe(OTHER_EVENT_ID);
  });

  it("parses wrong_event with no ticket when the server withholds it", () => {
    const result = parseCheckInTicketResult(
      flat({
        outcome: "wrong_event",
        registration_id: null,
        event_id: null,
        user_id: null,
        ticket_code: null,
        checked_in_at: null,
      }),
    );

    expect(result).toEqual({ outcome: "wrong_event", ticket: null, scanAttemptId });
  });

  it("parses invalid, which carries no ticket at all but still audits the scan", () => {
    expect(
      parseCheckInTicketResult(
        flat({
          outcome: "invalid",
          registration_id: null,
          event_id: null,
          user_id: null,
          ticket_code: null,
          checked_in_at: null,
        }),
      ),
    ).toEqual({ outcome: "invalid", scanAttemptId });
  });

  it("refuses a success with no checked_in_at, which would mean the server lied", () => {
    expect(() => parseCheckInTicketResult(flat({ checked_in_at: null }))).toThrow(/checked_in_at/);
  });

  it("refuses a success with no ticket", () => {
    expect(() =>
      parseCheckInTicketResult(
        flat({
          registration_id: null,
          event_id: null,
          user_id: null,
          ticket_code: null,
        }),
      ),
    ).toThrow(/ticket/);
  });

  it("refuses a partially populated ticket, which no correct function emits", () => {
    expect(() => parseCheckInTicketResult(flat({ ticket_code: null }))).toThrow(/partially/);
  });

  it("refuses an outcome outside the closed enum", () => {
    expect(checkInTicketResultSchema.safeParse({ outcome: "maybe" }).success).toBe(false);
  });
});
