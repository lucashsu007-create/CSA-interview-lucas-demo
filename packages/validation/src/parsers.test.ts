import { isMembershipActive, isRegistrationOpen, resolvePrice } from "@csa/domain";
import { describe, expect, it } from "vitest";

import {
  parseAnalyticsEventRow,
  parseAuditEventRow,
  parseEventRow,
  parseEventRows,
  parseMembershipPeriodRow,
  parsePartnerRow,
  parsePaymentRow,
  parseRegistrationRow,
  parseScanAttemptRow,
  parseUserRow,
} from "./parsers";
import { normalizeTimestamp, toDate } from "./primitives";

const USER_ID = "00000000-0000-4000-8000-000000000001";
const EVENT_ID = "00000000-0000-4000-8000-0000000000a1";

const userRow = {
  id: USER_ID,
  email: "member@demo.local",
  full_name: "Demo Member",
  role: "attendee",
  created_at: "2026-01-01T00:00:00+00:00",
};

const membershipPeriodRow = {
  id: "00000000-0000-4000-8000-0000000000b1",
  user_id: USER_ID,
  member_number: "CSA-0001",
  membership_type: "general",
  status: "active",
  starts_at: "2025-09-01T00:00:00+00:00",
  expires_at: "2026-08-31T23:59:59+00:00",
  created_at: "2025-09-01T00:00:00+00:00",
};

const eventRow = {
  id: EVENT_ID,
  title: "Demo Spring Gala",
  description: "A fictional event for the prototype.",
  category: "social",
  location: "Rotterdam",
  starts_at: "2026-06-01T18:00:00+00:00",
  registration_deadline_at: "2026-05-25T22:00:00+00:00",
  capacity: 120,
  price_member_cents: 1500,
  price_public_cents: 2500,
  status: "published",
  image_url: null,
  created_at: "2026-01-01T00:00:00+00:00",
};

const registrationRow = {
  id: "00000000-0000-4000-8000-0000000000c1",
  event_id: EVENT_ID,
  user_id: USER_ID,
  ticket_code: "K3M9QZ7B2T",
  price_paid_cents: 1500,
  is_member_price: true,
  payment_status: "paid",
  checked_in_at: null,
  created_at: "2026-05-01T09:00:00+00:00",
};

describe("row parsers rename every column exactly once", () => {
  it("maps a users row", () => {
    expect(parseUserRow(userRow)).toEqual({
      id: USER_ID,
      email: "member@demo.local",
      fullName: "Demo Member",
      role: "attendee",
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
    });
  });

  it("maps a membership_periods row, member_number included", () => {
    const period = parseMembershipPeriodRow(membershipPeriodRow);

    expect(period.memberNumber).toBe("CSA-0001");
    expect(period.membershipType).toBe("general");
    expect(period.userId).toBe(USER_ID);
    expect(period.startsAt).toEqual(new Date("2025-09-01T00:00:00.000Z"));
    expect(period.expiresAt).toEqual(new Date("2026-08-31T23:59:59.000Z"));
  });

  it("maps an events row including both prices", () => {
    const event = parseEventRow(eventRow);

    expect(event.priceMemberCents).toBe(1500);
    expect(event.pricePublicCents).toBe(2500);
    expect(event.registrationDeadlineAt).toEqual(new Date("2026-05-25T22:00:00.000Z"));
    expect(event.imageUrl).toBeNull();
  });

  it("maps a registrations row", () => {
    const registration = parseRegistrationRow(registrationRow);

    expect(registration.ticketCode).toBe("K3M9QZ7B2T");
    expect(registration.pricePaidCents).toBe(1500);
    expect(registration.isMemberPrice).toBe(true);
    expect(registration.checkedInAt).toBeNull();
  });

  it("maps checked_in_at to a Date once the ticket has been scanned", () => {
    const scanned = parseRegistrationRow({
      ...registrationRow,
      checked_in_at: "2026-06-01T18:05:00+00:00",
    });

    expect(scanned.checkedInAt).toEqual(new Date("2026-06-01T18:05:00.000Z"));
  });

  it("maps a payments row", () => {
    const payment = parsePaymentRow({
      id: "00000000-0000-4000-8000-0000000000d1",
      registration_id: registrationRow.id,
      provider: "mock",
      provider_reference: "mock_ref_0001",
      amount_cents: 1500,
      status: "paid",
      created_at: "2026-05-01T09:00:01+00:00",
    });

    expect(payment.registrationId).toBe(registrationRow.id);
    expect(payment.providerReference).toBe("mock_ref_0001");
    expect(payment.amountCents).toBe(1500);
  });

  it("maps a scan_attempts row, keeping both clocks", () => {
    const attempt = parseScanAttemptRow({
      id: "00000000-0000-4000-8000-0000000000e1",
      ticket_code: "K3M9QZ7B2T",
      event_id: EVENT_ID,
      device_id: "demo-scanner-01",
      scanned_at: "2026-06-01T18:05:00+00:00",
      received_at: "2026-06-01T18:25:02+00:00",
      outcome: "success",
      created_at: "2026-06-01T18:25:02+00:00",
    });

    expect(attempt.deviceId).toBe("demo-scanner-01");
    expect(attempt.scannedAt.getTime()).toBeLessThan(attempt.receivedAt.getTime());
  });

  it("keeps a rejected scan even though its code is not a valid ticket code", () => {
    // scan_attempts is the evidence table: a junk QR still has to land.
    const attempt = parseScanAttemptRow({
      id: "00000000-0000-4000-8000-0000000000e2",
      ticket_code: "not-a-ticket",
      event_id: EVENT_ID,
      device_id: "demo-scanner-01",
      scanned_at: "2026-06-01T18:06:00+00:00",
      received_at: "2026-06-01T18:06:00+00:00",
      outcome: "invalid",
      created_at: "2026-06-01T18:06:00+00:00",
    });

    expect(attempt.outcome).toBe("invalid");
    expect(attempt.ticketCode).toBe("not-a-ticket");
  });

  it("maps a partners row", () => {
    const partner = parsePartnerRow({
      id: "00000000-0000-4000-8000-0000000000f1",
      name: "Demo Noodle House",
      city: "Rotterdam",
      category: "food",
      discount_text: "10% off for members",
      address: "1 Fictional Street",
    });

    expect(partner.discountText).toBe("10% off for members");
  });

  it("maps an audit_events row with its jsonb metadata intact", () => {
    const audit = parseAuditEventRow({
      id: "00000000-0000-4000-8000-000000000101",
      actor_user_id: USER_ID,
      action: "register_for_event",
      entity_type: "registrations",
      entity_id: registrationRow.id,
      metadata: { priceCents: 1500, isMemberPrice: true, nested: { list: [1, 2, null] } },
      created_at: "2026-05-01T09:00:00+00:00",
    });

    expect(audit.actorUserId).toBe(USER_ID);
    expect(audit.entityType).toBe("registrations");
    expect(audit.metadata).toEqual({
      priceCents: 1500,
      isMemberPrice: true,
      nested: { list: [1, 2, null] },
    });
  });

  it("maps an analytics_events row from an anonymous visitor", () => {
    const analytics = parseAnalyticsEventRow({
      id: "00000000-0000-4000-8000-000000000201",
      name: "event_viewed",
      user_id: null,
      properties: { eventId: EVENT_ID },
      created_at: "2026-05-01T08:59:00+00:00",
    });

    expect(analytics.userId).toBeNull();
    expect(analytics.name).toBe("event_viewed");
  });

  it("parses a list of rows", () => {
    const events = parseEventRows([
      eventRow,
      { ...eventRow, id: "00000000-0000-4000-8000-0000000000a2" },
    ]);

    expect(events).toHaveLength(2);
    expect(events[1]?.id).toBe("00000000-0000-4000-8000-0000000000a2");
  });

  it("refuses anything that is not an array of rows", () => {
    expect(() => parseEventRows(eventRow)).toThrow(TypeError);
  });
});

describe("timestamp handling", () => {
  it("accepts the offset form PostgREST emits", () => {
    expect(toDate("2026-06-01T18:00:00+00:00")).toEqual(new Date("2026-06-01T18:00:00.000Z"));
  });

  it("accepts the Z form", () => {
    expect(toDate("2026-06-01T18:00:00.000Z")).toEqual(new Date("2026-06-01T18:00:00.000Z"));
  });

  it("accepts the space-separated form with a two-digit offset", () => {
    // `2026-06-01 18:00:00+00` is not parseable by every engine as written.
    expect(normalizeTimestamp("2026-06-01 18:00:00+00")).toBe("2026-06-01T18:00:00+00:00");
    expect(toDate("2026-06-01 18:00:00+00")).toEqual(new Date("2026-06-01T18:00:00.000Z"));
  });

  it("does not mistake a bare date for an offset", () => {
    expect(normalizeTimestamp("2026-06-01")).toBe("2026-06-01");
  });

  it("rejects an unparseable timestamp instead of producing an invalid Date", () => {
    expect(() => parseUserRow({ ...userRow, created_at: "yesterday" })).toThrow();
    expect(() => parseUserRow({ ...userRow, created_at: "2026-13-45T99:00:00Z" })).toThrow();
  });
});

describe("the parse boundary is where bad data stops", () => {
  it("rejects a fractional price, so no float reaches the domain", () => {
    expect(() => parseEventRow({ ...eventRow, price_member_cents: 15.5 })).toThrow();
  });

  it("rejects a negative price", () => {
    expect(() => parseEventRow({ ...eventRow, price_public_cents: -1 })).toThrow();
  });

  it("rejects a capacity of zero, matching CHECK (capacity > 0)", () => {
    expect(() => parseEventRow({ ...eventRow, capacity: 0 })).toThrow();
  });

  it("rejects a value outside a closed enum", () => {
    expect(() => parseEventRow({ ...eventRow, status: "archived" })).toThrow();
    expect(() => parseUserRow({ ...userRow, role: "member" })).toThrow();
  });

  it("rejects a ticket code that is not Crockford base32", () => {
    expect(() => parseRegistrationRow({ ...registrationRow, ticket_code: "k3m9qz7b2t" })).toThrow();
    expect(() => parseRegistrationRow({ ...registrationRow, ticket_code: "K3M9QZ7B2I" })).toThrow();
  });

  it("rejects a missing column rather than yielding undefined", () => {
    const { member_number: _dropped, ...withoutMemberNumber } = membershipPeriodRow;
    expect(() => parseMembershipPeriodRow(withoutMemberNumber)).toThrow();
  });

  it("ignores columns the contract does not name, so an added column is not an outage", () => {
    const parsed = parseUserRow({ ...userRow, avatar_url: "https://example.invalid/a.png" });
    expect(parsed).not.toHaveProperty("avatar_url");
  });
});

describe("parsed rows feed the domain predicates directly", () => {
  it("a parsed event and membership resolve the member price", () => {
    const event = parseEventRow(eventRow);
    const period = parseMembershipPeriodRow(membershipPeriodRow);
    const at = new Date("2026-05-01T09:00:00.000Z");

    expect(isRegistrationOpen(event, at)).toBe(true);
    expect(isMembershipActive(period, at)).toBe(true);
    expect(resolvePrice(event, isMembershipActive(period, at))).toEqual({
      cents: 1500,
      isMemberPrice: true,
    });
  });

  it("the same rows resolve the public price once the membership has lapsed", () => {
    const event = parseEventRow(eventRow);
    const period = parseMembershipPeriodRow(membershipPeriodRow);
    const at = new Date("2026-09-15T09:00:00.000Z");

    expect(isMembershipActive(period, at)).toBe(false);
    expect(resolvePrice(event, isMembershipActive(period, at))).toEqual({
      cents: 2500,
      isMemberPrice: false,
    });
  });
});
