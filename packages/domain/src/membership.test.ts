import { describe, expect, it } from "vitest";

import { makeMembershipPeriod } from "./__fixtures__/factories";
import { findActiveMembership, hasActiveMembership, isMembershipActive } from "./membership";

const STARTS_AT = new Date("2026-01-01T00:00:00.000Z");
const EXPIRES_AT = new Date("2026-12-31T23:59:59.000Z");

const period = makeMembershipPeriod({ startsAt: STARTS_AT, expiresAt: EXPIRES_AT });

describe("isMembershipActive", () => {
  it("is active in the middle of the period", () => {
    expect(isMembershipActive(period, new Date("2026-06-15T12:00:00.000Z"))).toBe(true);
  });

  it("is inactive before the period starts", () => {
    expect(isMembershipActive(period, new Date("2025-12-31T23:59:59.999Z"))).toBe(false);
  });

  it("is inactive after the period ends", () => {
    expect(isMembershipActive(period, new Date("2027-01-01T00:00:00.000Z"))).toBe(false);
  });

  describe("boundaries — SQL BETWEEN is inclusive at both ends", () => {
    it("is active at exactly starts_at", () => {
      expect(isMembershipActive(period, STARTS_AT)).toBe(true);
    });

    it("is active at exactly expires_at, the registration moment", () => {
      // The membership expires at the instant the user presses register. The
      // database evaluates `now() BETWEEN starts_at AND expires_at`, which is
      // inclusive, so this registration still gets the member price. If this
      // ever flips, the client would show a price the server refuses.
      expect(isMembershipActive(period, EXPIRES_AT)).toBe(true);
    });

    it("is inactive one millisecond after expires_at", () => {
      expect(isMembershipActive(period, new Date(EXPIRES_AT.getTime() + 1))).toBe(false);
    });

    it("is inactive one millisecond before starts_at", () => {
      expect(isMembershipActive(period, new Date(STARTS_AT.getTime() - 1))).toBe(false);
    });
  });

  describe("status gates the window", () => {
    it("a cancelled period inside its window is not active", () => {
      const cancelled = makeMembershipPeriod({ status: "cancelled" });
      expect(isMembershipActive(cancelled, new Date("2026-06-15T12:00:00.000Z"))).toBe(false);
    });

    it("an expired-status period inside its window is not active", () => {
      // Rows can lag: a nightly job flips status to `expired` while the dates
      // still look open. Status wins.
      const stale = makeMembershipPeriod({ status: "expired" });
      expect(isMembershipActive(stale, new Date("2026-06-15T12:00:00.000Z"))).toBe(false);
    });
  });
});

describe("findActiveMembership across several periods", () => {
  // A returning member: two closed years, one open year, one cancelled renewal.
  const periods = [
    makeMembershipPeriod({
      id: "00000000-0000-4000-8000-0000000000b1",
      memberNumber: "CSA-0001",
      status: "expired",
      startsAt: new Date("2023-09-01T00:00:00.000Z"),
      expiresAt: new Date("2024-08-31T23:59:59.000Z"),
    }),
    makeMembershipPeriod({
      id: "00000000-0000-4000-8000-0000000000b2",
      memberNumber: "CSA-0002",
      status: "expired",
      startsAt: new Date("2024-09-01T00:00:00.000Z"),
      expiresAt: new Date("2025-08-31T23:59:59.000Z"),
    }),
    makeMembershipPeriod({
      id: "00000000-0000-4000-8000-0000000000b3",
      memberNumber: "CSA-0003",
      status: "active",
      startsAt: new Date("2025-09-01T00:00:00.000Z"),
      expiresAt: new Date("2026-08-31T23:59:59.000Z"),
    }),
    makeMembershipPeriod({
      id: "00000000-0000-4000-8000-0000000000b4",
      memberNumber: "CSA-0004",
      status: "cancelled",
      startsAt: new Date("2026-09-01T00:00:00.000Z"),
      expiresAt: new Date("2027-08-31T23:59:59.000Z"),
    }),
  ];

  it("picks the single active period out of four", () => {
    const at = new Date("2026-03-01T12:00:00.000Z");
    expect(findActiveMembership(periods, at)?.memberNumber).toBe("CSA-0003");
    expect(hasActiveMembership(periods, at)).toBe(true);
  });

  it("finds nothing in the gap after the active period ends", () => {
    // Between the active year ending and the cancelled renewal starting.
    const at = new Date("2026-08-31T23:59:59.001Z");
    expect(findActiveMembership(periods, at)).toBeNull();
    expect(hasActiveMembership(periods, at)).toBe(false);
  });

  it("ignores a cancelled period even inside its dates", () => {
    const at = new Date("2027-01-01T00:00:00.000Z");
    expect(findActiveMembership(periods, at)).toBeNull();
  });

  it("has no active membership when the user has no periods at all", () => {
    expect(hasActiveMembership([], new Date("2026-03-01T12:00:00.000Z"))).toBe(false);
  });
});
