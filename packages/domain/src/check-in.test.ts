import { describe, expect, it } from "vitest";

import { DEMO_IDS, makeRegistration } from "./__fixtures__/factories";
import { canCheckIn, resolveCheckedInAt } from "./check-in";

const CHECKED_IN_AT = new Date("2026-06-01T18:05:00.000Z");

describe("canCheckIn", () => {
  it("accepts an unused ticket scanned at its own event", () => {
    const registration = makeRegistration({ eventId: DEMO_IDS.gala, checkedInAt: null });
    expect(canCheckIn(registration, DEMO_IDS.gala)).toEqual({ outcome: "success" });
  });

  describe("wrong event", () => {
    it("rejects a ticket scanned at a different event", () => {
      const registration = makeRegistration({ eventId: DEMO_IDS.gala, checkedInAt: null });

      expect(canCheckIn(registration, DEMO_IDS.workshop)).toEqual({
        outcome: "wrong_event",
        ticketEventId: DEMO_IDS.gala,
        scannedEventId: DEMO_IDS.workshop,
      });
    });

    it("reports both event ids, so the scanner can say which event it is for", () => {
      const registration = makeRegistration({ eventId: DEMO_IDS.gala });
      const decision = canCheckIn(registration, DEMO_IDS.workshop);

      expect(decision.outcome).toBe("wrong_event");
      if (decision.outcome !== "wrong_event") throw new Error("unreachable");
      expect(decision.ticketEventId).not.toBe(decision.scannedEventId);
    });
  });

  describe("already checked in", () => {
    it("returns duplicate carrying the ORIGINAL check-in time", () => {
      const registration = makeRegistration({
        eventId: DEMO_IDS.gala,
        checkedInAt: CHECKED_IN_AT,
      });

      expect(canCheckIn(registration, DEMO_IDS.gala)).toEqual({
        outcome: "duplicate",
        checkedInAt: CHECKED_IN_AT,
      });
    });

    it("is idempotent: the decision does not change on repeat scans", () => {
      const registration = makeRegistration({ checkedInAt: CHECKED_IN_AT });
      const first = canCheckIn(registration, DEMO_IDS.gala);
      const second = canCheckIn(registration, DEMO_IDS.gala);

      expect(second).toEqual(first);
    });
  });

  describe("precedence", () => {
    it("an already-used ticket at the WRONG event reads as wrong_event", () => {
      // The database checks the event before it checks for a prior check-in.
      // Disagreeing here would mean the scanner shows "already scanned" for a
      // ticket the server then reports as belonging elsewhere.
      const registration = makeRegistration({
        eventId: DEMO_IDS.gala,
        checkedInAt: CHECKED_IN_AT,
      });

      expect(canCheckIn(registration, DEMO_IDS.workshop).outcome).toBe("wrong_event");
    });
  });
});

describe("resolveCheckedInAt", () => {
  const serverNow = new Date("2026-06-01T18:05:02.000Z");

  it("keeps the scanner time when the scan happened before the server saw it", () => {
    // The offline case: scanned at the door, synced twenty minutes later.
    const scannedAt = new Date("2026-06-01T17:45:00.000Z");
    expect(resolveCheckedInAt(scannedAt, serverNow)).toEqual(scannedAt);
  });

  it("clamps a scanner clock running ahead of the server", () => {
    const scannedAt = new Date("2026-06-01T19:00:00.000Z");
    expect(resolveCheckedInAt(scannedAt, serverNow)).toEqual(serverNow);
  });

  it("is stable when the two clocks agree exactly", () => {
    expect(resolveCheckedInAt(serverNow, serverNow)).toEqual(serverNow);
  });

  it("a late-arriving scan never wins over an earlier one", () => {
    // The conflict rule: the canonical check-in is the earliest reported scan.
    const early = new Date("2026-06-01T17:45:00.000Z");
    const late = new Date("2026-06-01T18:30:00.000Z");
    const canonical = [early, late].reduce((a, b) => (a.getTime() <= b.getTime() ? a : b));

    expect(resolveCheckedInAt(canonical, serverNow)).toEqual(early);
  });
});
