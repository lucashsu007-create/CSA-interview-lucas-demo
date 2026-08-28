import { describe, expect, it } from "vitest";

import { makeEvent } from "./__fixtures__/factories";
import { isRegistrationOpen, registrationClosedReason } from "./events";

const DEADLINE = new Date("2026-05-25T22:00:00.000Z");
const event = makeEvent({ status: "published", registrationDeadlineAt: DEADLINE });

describe("isRegistrationOpen", () => {
  it("is open for a published event before the deadline", () => {
    expect(isRegistrationOpen(event, new Date("2026-05-01T09:00:00.000Z"))).toBe(true);
  });

  it("is closed after the deadline", () => {
    expect(isRegistrationOpen(event, new Date("2026-05-26T00:00:00.000Z"))).toBe(false);
  });

  describe("the deadline boundary", () => {
    it("is open at exactly the deadline", () => {
      // The database rejects only when `now() > registration_deadline_at`, so
      // the instant itself is still inside the window.
      expect(isRegistrationOpen(event, DEADLINE)).toBe(true);
    });

    it("is closed one millisecond after the deadline", () => {
      expect(isRegistrationOpen(event, new Date(DEADLINE.getTime() + 1))).toBe(false);
    });

    it("is open one millisecond before the deadline", () => {
      expect(isRegistrationOpen(event, new Date(DEADLINE.getTime() - 1))).toBe(true);
    });
  });

  describe("status gates the window", () => {
    const before = new Date("2026-05-01T09:00:00.000Z");

    it("is closed for a draft event", () => {
      expect(isRegistrationOpen(makeEvent({ status: "draft" }), before)).toBe(false);
    });

    it("is closed for a sold-out event", () => {
      expect(isRegistrationOpen(makeEvent({ status: "sold_out" }), before)).toBe(false);
    });

    it("is closed for a cancelled event", () => {
      expect(isRegistrationOpen(makeEvent({ status: "cancelled" }), before)).toBe(false);
    });
  });
});

describe("registrationClosedReason", () => {
  it("is null while registration is open", () => {
    expect(registrationClosedReason(event, DEADLINE)).toBeNull();
  });

  it("reports registration_closed past the deadline", () => {
    expect(registrationClosedReason(event, new Date(DEADLINE.getTime() + 1))).toBe(
      "registration_closed",
    );
  });

  it("reports event_not_published for an unpublished event", () => {
    const draft = makeEvent({ status: "draft", registrationDeadlineAt: DEADLINE });
    expect(registrationClosedReason(draft, new Date("2026-05-01T09:00:00.000Z"))).toBe(
      "event_not_published",
    );
  });

  it("checks status before the deadline, in the order the database does", () => {
    // A draft event whose deadline has also passed reports the status problem,
    // matching which error `register_for_event` would raise first.
    const draft = makeEvent({ status: "draft", registrationDeadlineAt: DEADLINE });
    expect(registrationClosedReason(draft, new Date(DEADLINE.getTime() + 1))).toBe(
      "event_not_published",
    );
  });
});
