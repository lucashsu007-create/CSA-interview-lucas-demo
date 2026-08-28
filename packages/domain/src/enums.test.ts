import { describe, expect, it } from "vitest";

import {
  ANALYTICS_EVENT_NAMES,
  CHECK_IN_OUTCOMES,
  EVENT_CATEGORIES,
  EVENT_STATUSES,
  MEMBERSHIP_STATUSES,
  MEMBERSHIP_TYPES,
  IMPORT_DISPOSITIONS,
  IMPORT_MODES,
  IMPORT_RUN_STATUSES,
  LEGACY_SYSTEMS,
  PAYMENT_STATUSES,
  QUARANTINE_REASONS,
  QUARANTINE_STATES,
  RECONCILIATION_VERDICTS,
  USER_ROLES,
  isCheckInOutcome,
  isLegacySystem,
  isQuarantineReason,
  isUserRole,
} from "./enums";

/**
 * These assertions are the freeze. If the database enum and this list ever
 * disagree, one of the two moved without the contract moving first, and this
 * test is where it surfaces.
 */
describe("contract §3 enums", () => {
  it("matches the frozen values exactly", () => {
    expect(USER_ROLES).toEqual(["attendee", "staff", "admin"]);
    expect(MEMBERSHIP_TYPES).toEqual(["general", "alumni", "honorary"]);
    expect(MEMBERSHIP_STATUSES).toEqual(["active", "expired", "cancelled"]);
    expect(EVENT_CATEGORIES).toEqual(["social", "cultural", "career", "educational", "sports"]);
    expect(EVENT_STATUSES).toEqual(["draft", "published", "sold_out", "cancelled"]);
    expect(PAYMENT_STATUSES).toEqual(["pending", "paid", "failed", "refunded"]);
    expect(CHECK_IN_OUTCOMES).toEqual(["success", "duplicate", "wrong_event", "invalid"]);
  });

  it("freezes the closed set of analytics event names", () => {
    expect(ANALYTICS_EVENT_NAMES).toEqual([
      "event_viewed",
      "registration_started",
      "registration_completed",
      "payment_failed",
      "ticket_opened",
      "check_in_attempted",
      "check_in_succeeded",
      "check_in_rejected",
    ]);
  });

  it("guards reject values outside the closed set", () => {
    expect(isUserRole("admin")).toBe(true);
    expect(isUserRole("member")).toBe(false);
    expect(isUserRole(undefined)).toBe(false);
    expect(isCheckInOutcome("wrong_event")).toBe(true);
    expect(isCheckInOutcome("WRONG_EVENT")).toBe(false);
  });
});

/**
 * Wave M. The same freeze, for the migration harness — contract §3 and §15.
 * `quarantine_reason` matters most: the migration plan's §17 gate requires a
 * rejection breakdown, so a reason that drifts out of this set is a rejection
 * nobody can count.
 */
describe("contract §3 enums — Wave M", () => {
  it("matches the frozen values exactly", () => {
    expect(LEGACY_SYSTEMS).toEqual([
      "wordpress",
      "mongodb",
      "google_forms",
      "mollie",
      "office_ledger",
    ]);
    expect(IMPORT_MODES).toEqual(["dry_run", "load", "delta"]);
    expect(IMPORT_RUN_STATUSES).toEqual(["running", "succeeded", "failed", "rolled_back"]);
    expect(IMPORT_DISPOSITIONS).toEqual(["accepted", "warning", "rejected"]);
    expect(QUARANTINE_STATES).toEqual(["open", "resolved", "discarded"]);
  });

  it("freezes the closed set of quarantine reasons", () => {
    expect(QUARANTINE_REASONS).toEqual([
      "ambiguous_duplicate",
      "unparseable_date",
      "missing_required_field",
      "unresolvable_country",
      "orphaned_reference",
      "conflicting_status",
      "out_of_scope",
    ]);
  });

  it("permits exactly three reconciliation verdicts", () => {
    expect(RECONCILIATION_VERDICTS).toEqual([
      "RECONCILES",
      "DOES_NOT_RECONCILE",
      "NOT_YET_MEASURABLE",
    ]);
  });

  it("guards reject values outside the closed set", () => {
    expect(isLegacySystem("office_ledger")).toBe(true);
    expect(isLegacySystem("wordpress_multisite")).toBe(false);
    expect(isQuarantineReason("ambiguous_duplicate")).toBe(true);
    // A free-text reason is the failure mode the enum exists to prevent.
    expect(isQuarantineReason("looked a bit odd")).toBe(false);
  });
});
