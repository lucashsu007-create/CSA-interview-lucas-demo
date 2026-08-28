/**
 * The frozen surface from contract §12, asserted as a list.
 *
 * Cheap, and it catches two things nothing else here would: a barrel that
 * cannot be imported at all (a circular import between the read modules would
 * surface as an undefined export rather than an error), and a rename that
 * quietly drops a name two other workstreams are building against.
 */

import { describe, expect, it } from "vitest";

import * as apiClient from "./index";

describe("@csa/api-client surface", () => {
  it("exports every function contract §12 froze", () => {
    const frozen = [
      // session
      "signSession",
      "verifySession",
      // access
      "withSession",
      // reads
      "listPublishedEvents",
      "getEvent",
      "listPartners",
      "activeMembership",
      "myRegistrations",
      "dashboardSummary",
      // writes
      "registerForEvent",
      "checkInTicket",
    ] as const;

    for (const name of frozen) {
      expect(typeof apiClient[name], `${name} should be exported as a function`).toBe("function");
    }
  });

  it("exports the lifecycle and error helpers the apps need around it", () => {
    expect(typeof apiClient.getDb).toBe("function");
    expect(typeof apiClient.closeDb).toBe("function");
    expect(typeof apiClient.toCsaError).toBe("function");
    expect(typeof apiClient.isCsaError).toBe("function");
    expect(typeof apiClient.CsaError).toBe("function");
    expect(apiClient.CSA_ERROR_TOKENS).toContain("event_full");
  });

  it("exports the elevated read helper, deliberately and narrowly", () => {
    // It bypasses the caller's identity by design, so hiding it looked safer.
    // It is not: without it the admin app cannot resolve a demo identity at
    // sign-in and reaches around this package to the raw pool instead, losing
    // both the closed reason enum and the read-only guarantee. Exported and
    // constrained beats unexported and worked around.
    expect("withPrivilegedRead" in apiClient).toBe(true);
  });
});
