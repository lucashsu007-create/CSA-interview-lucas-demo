/**
 * The transform rule registry.
 *
 * Every rule is named here before it runs, and every record records the rules
 * that were applied to it. A rule invented mid-import is an unreviewable data
 * change, and a derivation nobody wrote down is a derivation nobody can review
 * — the ETL standard rules out both, and this file is where that is kept.
 *
 * The names are the strings that land in `import_records.applied_rules`, so
 * renaming one is a schema-visible change, not a refactor.
 */
export const RULES = {
  /** Trim, strip a display name, lowercase. Never "correct" a domain. */
  EMAIL_NORMALISED: "email_trimmed_display_name_stripped_lowercased",
  /** `dd-mm-yyyy` read as a date. Rejected when the day does not exist. */
  DATE_DUTCH_PARSED: "date_parsed_as_dd_mm_yyyy",
  DATE_ISO_PARSED: "date_parsed_as_iso_8601",
  /** `€ 15,00`, `15.00` and `15,00` all read as 1500 cents. */
  MONEY_PARSED: "money_parsed_to_integer_cents",
  /** A phone kept exactly as found because the country was not certain. */
  PHONE_LEFT_UNNORMALISED: "phone_left_as_found_country_not_certain",
  PHONE_E164: "phone_normalised_to_e164_country_known",
  /**
   * Premium bundles a language course. The target schema models memberships and
   * not courses, so the period imports as `general` and the entitlement is
   * recorded as a warning rather than silently dropped or silently invented.
   */
  PREMIUM_MAPPED: "premium_mapped_to_general_language_course_not_modelled",
  /** Mollie's vocabulary is wider than the contract's four payment statuses. */
  MOLLIE_OPEN_PENDING: "mollie_open_mapped_to_pending",
  MOLLIE_EXPIRED_FAILED: "mollie_expired_mapped_to_failed",
  MOLLIE_STATUS_DIRECT: "mollie_status_mapped_directly",
  /** `status` was a field someone forgot to update; the dates are the fact. */
  STATUS_DERIVED_FROM_PERIOD: "status_derived_from_period_dates",
  /**
   * The legacy event has no capacity anywhere in WordPress, and no deadline. A
   * default is invented here and flagged, because an event with no capacity
   * cannot be represented at all in a schema whose whole point is that capacity
   * holds under concurrency.
   */
  CAPACITY_DEFAULTED: "capacity_defaulted_absent_in_source",
  DEADLINE_DERIVED: "deadline_derived_from_start_time",
  /** One price in the source; the target has a member price and a public one. */
  SINGLE_PRICE_APPLIED_TO_BOTH: "single_legacy_price_applied_to_member_and_public",
  /** Same normalised email in two systems: one person, earliest record wins. */
  DEDUP_BY_EMAIL: "dedup_email_exact_after_normalisation_earliest_wins",
} as const;

export type RuleName = (typeof RULES)[keyof typeof RULES];

/**
 * Deduplication rules, in the fixed order they are applied.
 *
 * Approved before the run and deterministic, per the ETL standard. There is
 * deliberately no name-similarity rule: a fuzzy match on a name is how a
 * migration silently merges two people into one, and the whole point of
 * quarantine is that the ambiguous case gets a human rather than a heuristic.
 */
export const DEDUP_RULES = [
  {
    name: RULES.DEDUP_BY_EMAIL,
    description:
      "Two records whose emails are identical after normalisation are the same person. " +
      "The earliest created record wins and keeps its identifiers; the later one is " +
      "recorded as merged away.",
  },
] as const;

/**
 * What the harness will NOT do, written down so that its absence is a decision
 * rather than an oversight.
 */
export const REFUSED_RULES = [
  "Merge two records because their names match. Names are not identifiers, and " +
    "the ledger contains exactly this case on purpose: same human, different " +
    "email. It is quarantined as ambiguous_duplicate for a person to resolve.",
  "Correct an email domain that looks like a typo. A conservative transform " +
    "that quarantines more is cheaper than a clever one that guesses wrong.",
  "Infer a country from a national phone number. `612345678` is a Dutch mobile " +
    "and also a valid subscriber number elsewhere; E.164 would require a guess.",
  "Import a field nobody named a use for. GDPR applies to the target, not only " + "to the source.",
] as const;
