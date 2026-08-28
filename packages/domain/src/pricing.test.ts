import { describe, expect, it } from "vitest";

import { makeEvent, makeMembershipPeriod, makeUser } from "./__fixtures__/factories";
import { hasActiveMembership } from "./membership";
import { formatEur } from "./money";
import { initialPaymentStatus, resolvePrice } from "./pricing";

const AT = new Date("2026-03-01T12:00:00.000Z");
const paidEvent = makeEvent({ priceMemberCents: 1500, pricePublicCents: 2500 });

describe("resolvePrice", () => {
  it("gives the member price when a membership is active", () => {
    expect(resolvePrice(paidEvent, true)).toEqual({ cents: 1500, isMemberPrice: true });
  });

  it("gives the public price when no membership is active", () => {
    expect(resolvePrice(paidEvent, false)).toEqual({ cents: 2500, isMemberPrice: false });
  });

  it("reports the member price even when both prices are equal", () => {
    // is_member_price records which rule applied, not whether money was saved.
    const flatPriced = makeEvent({ priceMemberCents: 2000, pricePublicCents: 2000 });
    expect(resolvePrice(flatPriced, true)).toEqual({ cents: 2000, isMemberPrice: true });
    expect(resolvePrice(flatPriced, false)).toEqual({ cents: 2000, isMemberPrice: false });
  });

  describe("a zero-price event", () => {
    const freeEvent = makeEvent({ priceMemberCents: 0, pricePublicCents: 0 });

    it("resolves to zero for a member and records that the member rule applied", () => {
      expect(resolvePrice(freeEvent, true)).toEqual({ cents: 0, isMemberPrice: true });
    });

    it("resolves to zero for a non-member", () => {
      expect(resolvePrice(freeEvent, false)).toEqual({ cents: 0, isMemberPrice: false });
    });

    it("is marked paid on insert, since there is nothing to pay", () => {
      expect(initialPaymentStatus(resolvePrice(freeEvent, false).cents)).toBe("paid");
    });

    it("renders as a free event rather than €0,00 when the UI asks for a label", () => {
      expect(formatEur(resolvePrice(freeEvent, true).cents, { zeroLabel: "Free" })).toBe("Free");
    });
  });

  describe("a member-free, public-paid event", () => {
    const mixedEvent = makeEvent({ priceMemberCents: 0, pricePublicCents: 500 });

    it("is paid immediately for the member and pending for everyone else", () => {
      const member = resolvePrice(mixedEvent, true);
      const guest = resolvePrice(mixedEvent, false);
      expect(initialPaymentStatus(member.cents)).toBe("paid");
      expect(initialPaymentStatus(guest.cents)).toBe("pending");
    });
  });
});

/**
 * Contract §2: role governs permissions only. Member pricing is never derived
 * from role.
 *
 * `resolvePrice` takes no user and no role, so this is enforced by the
 * signature. These tests run the whole path a client would run — user, their
 * membership periods, the event — for the two roles most likely to be assumed
 * privileged.
 */
describe("role never determines pricing", () => {
  it("an admin with no active membership pays the PUBLIC price", () => {
    const admin = makeUser({ role: "admin", email: "admin@demo.local" });

    // No membership_periods row at all — the most common admin case.
    const price = resolvePrice(paidEvent, hasActiveMembership([], AT));

    expect(admin.role).toBe("admin");
    expect(price).toEqual({ cents: 2500, isMemberPrice: false });
  });

  it("a staff user with only an expired membership pays the PUBLIC price", () => {
    const staff = makeUser({ role: "staff", email: "staff@demo.local" });
    const expired = [
      makeMembershipPeriod({
        userId: staff.id,
        status: "expired",
        startsAt: new Date("2024-09-01T00:00:00.000Z"),
        expiresAt: new Date("2025-08-31T23:59:59.000Z"),
      }),
    ];

    const price = resolvePrice(paidEvent, hasActiveMembership(expired, AT));

    expect(price).toEqual({ cents: 2500, isMemberPrice: false });
  });

  it("a plain attendee WITH an active membership pays the member price", () => {
    const attendee = makeUser({ role: "attendee", email: "member@demo.local" });
    const active = [makeMembershipPeriod({ userId: attendee.id, status: "active" })];

    const price = resolvePrice(paidEvent, hasActiveMembership(active, AT));

    expect(price).toEqual({ cents: 1500, isMemberPrice: true });
  });

  it("the same user pays the public price once the membership expires", () => {
    const attendee = makeUser({ role: "attendee" });
    const periods = [
      makeMembershipPeriod({
        userId: attendee.id,
        status: "active",
        startsAt: new Date("2025-09-01T00:00:00.000Z"),
        expiresAt: new Date("2026-08-31T23:59:59.000Z"),
      }),
    ];

    const during = resolvePrice(paidEvent, hasActiveMembership(periods, AT));
    const after = resolvePrice(
      paidEvent,
      hasActiveMembership(periods, new Date("2026-09-01T00:00:00.000Z")),
    );

    expect(during).toEqual({ cents: 1500, isMemberPrice: true });
    expect(after).toEqual({ cents: 2500, isMemberPrice: false });
  });
});

describe("initialPaymentStatus", () => {
  it("is paid only at exactly zero", () => {
    expect(initialPaymentStatus(0)).toBe("paid");
    expect(initialPaymentStatus(1)).toBe("pending");
    expect(initialPaymentStatus(2500)).toBe("pending");
  });
});
