/**
 * Contract §3. Every enum is closed: adding a value is a schema change, not a
 * string literal in a component.
 *
 * Each enum is a single `as const` array so the values exist at runtime (for
 * dropdowns, Zod schemas and exhaustiveness tests) and the union type is derived
 * from it — there is never a second hand-maintained list to drift.
 */

function guard<T extends string>(values: readonly T[]) {
  return (value: unknown): value is T =>
    typeof value === "string" && (values as readonly string[]).includes(value);
}

/** Contract §2: role governs permissions only. It never determines pricing. */
export const USER_ROLES = ["attendee", "staff", "admin"] as const;
export type UserRole = (typeof USER_ROLES)[number];
export const isUserRole = guard(USER_ROLES);

export const MEMBERSHIP_TYPES = ["general", "alumni", "honorary"] as const;
export type MembershipType = (typeof MEMBERSHIP_TYPES)[number];
export const isMembershipType = guard(MEMBERSHIP_TYPES);

export const MEMBERSHIP_STATUSES = ["active", "expired", "cancelled"] as const;
export type MembershipStatus = (typeof MEMBERSHIP_STATUSES)[number];
export const isMembershipStatus = guard(MEMBERSHIP_STATUSES);

export const EVENT_CATEGORIES = ["social", "cultural", "career", "educational", "sports"] as const;
export type EventCategory = (typeof EVENT_CATEGORIES)[number];
export const isEventCategory = guard(EVENT_CATEGORIES);

export const EVENT_STATUSES = ["draft", "published", "sold_out", "cancelled"] as const;
export type EventStatus = (typeof EVENT_STATUSES)[number];
export const isEventStatus = guard(EVENT_STATUSES);

export const PAYMENT_STATUSES = ["pending", "paid", "failed", "refunded"] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];
export const isPaymentStatus = guard(PAYMENT_STATUSES);

export const CHECK_IN_OUTCOMES = ["success", "duplicate", "wrong_event", "invalid"] as const;
export type CheckInOutcome = (typeof CHECK_IN_OUTCOMES)[number];
export const isCheckInOutcome = guard(CHECK_IN_OUTCOMES);

/** Contract §4 (`analytics_events`): the name column is a closed enum too. */
export const ANALYTICS_EVENT_NAMES = [
  "event_viewed",
  "registration_started",
  "registration_completed",
  "payment_failed",
  "ticket_opened",
  "check_in_attempted",
  "check_in_succeeded",
  "check_in_rejected",
] as const;
export type AnalyticsEventName = (typeof ANALYTICS_EVENT_NAMES)[number];
export const isAnalyticsEventName = guard(ANALYTICS_EVENT_NAMES);

/** Contract §4 (`payments`): the prototype has a mock provider only. */
export const PAYMENT_PROVIDERS = ["mock"] as const;
export type PaymentProvider = (typeof PAYMENT_PROVIDERS)[number];
export const isPaymentProvider = guard(PAYMENT_PROVIDERS);

/* -------------------------------------------------------------------------
 * Wave M — the migration harness. Contract §3 and §15.
 * ---------------------------------------------------------------------- */

/**
 * Contract §15. Five legacy sources, each corresponding to something publicly
 * visible on CSA's own surfaces. `office_ledger` is the in-person registration
 * path the membership page advertises for anyone who cannot pay by iDEAL — a
 * second intake beside the online one, and therefore where the same person ends
 * up recorded twice under two spellings.
 */
export const LEGACY_SYSTEMS = [
  "wordpress",
  "mongodb",
  "google_forms",
  "mollie",
  "office_ledger",
] as const;
export type LegacySystem = (typeof LEGACY_SYSTEMS)[number];
export const isLegacySystem = guard(LEGACY_SYSTEMS);

/** `dry_run` transforms and reports but writes no target rows — contract §18.3. */
export const IMPORT_MODES = ["dry_run", "load", "delta"] as const;
export type ImportMode = (typeof IMPORT_MODES)[number];
export const isImportMode = guard(IMPORT_MODES);

export const IMPORT_RUN_STATUSES = ["running", "succeeded", "failed", "rolled_back"] as const;
export type ImportRunStatus = (typeof IMPORT_RUN_STATUSES)[number];
export const isImportRunStatus = guard(IMPORT_RUN_STATUSES);

/**
 * A `warning` row imported, but with a derived or defaulted field, and is what
 * manual sampling reads first. A `rejected` row did not import and always has a
 * matching quarantine record.
 */
export const IMPORT_DISPOSITIONS = ["accepted", "warning", "rejected"] as const;
export type ImportDisposition = (typeof IMPORT_DISPOSITIONS)[number];
export const isImportDisposition = guard(IMPORT_DISPOSITIONS);

/**
 * Closed, and deliberately not free text: the migration plan's §17 gate requires
 * a rejection breakdown, and free text cannot be counted.
 */
export const QUARANTINE_REASONS = [
  "ambiguous_duplicate",
  "unparseable_date",
  "missing_required_field",
  "unresolvable_country",
  "orphaned_reference",
  "conflicting_status",
  "out_of_scope",
] as const;
export type QuarantineReason = (typeof QUARANTINE_REASONS)[number];
export const isQuarantineReason = guard(QUARANTINE_REASONS);

export const QUARANTINE_STATES = ["open", "resolved", "discarded"] as const;
export type QuarantineState = (typeof QUARANTINE_STATES)[number];
export const isQuarantineState = guard(QUARANTINE_STATES);

/**
 * Contract §17. The only three verdicts a reconciliation may report.
 * `NOT_YET_MEASURABLE` is the correct answer whenever an input is missing — it
 * is preferred to a confident one drawn from an incomplete run.
 */
export const RECONCILIATION_VERDICTS = [
  "RECONCILES",
  "DOES_NOT_RECONCILE",
  "NOT_YET_MEASURABLE",
] as const;
export type ReconciliationVerdict = (typeof RECONCILIATION_VERDICTS)[number];
export const isReconciliationVerdict = guard(RECONCILIATION_VERDICTS);
