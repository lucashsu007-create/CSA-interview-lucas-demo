import type {
  ImportDisposition,
  LegacySystem,
  QuarantineReason,
  QuarantineState,
} from "@csa/domain";

/**
 * Human labels for the closed sets.
 *
 * A `Record` over the enum rather than a lookup with a fallback, so adding a
 * value to the contract makes this fail to compile instead of rendering a raw
 * `snake_case` token at a committee member.
 */
export const LEGACY_SYSTEM_LABEL: Record<LegacySystem, string> = {
  wordpress: "WordPress",
  mongodb: "MongoDB",
  google_forms: "Google Forms",
  mollie: "Mollie",
  office_ledger: "Office register",
};

export const QUARANTINE_REASON_LABEL: Record<QuarantineReason, string> = {
  ambiguous_duplicate: "Ambiguous duplicate",
  unparseable_date: "Unparseable date",
  missing_required_field: "Missing required field",
  unresolvable_country: "Unresolvable country",
  orphaned_reference: "Orphaned reference",
  conflicting_status: "Conflicting status",
  out_of_scope: "Out of scope",
};

/** What a reviewer is actually being asked to decide, per reason. */
export const QUARANTINE_REASON_PROMPT: Record<QuarantineReason, string> = {
  ambiguous_duplicate:
    "Two records may be the same person. The rules do not merge on a name, so this needs someone who can check.",
  unparseable_date: "The source date is not a date. Supply the real one, or discard the row.",
  missing_required_field:
    "There is nothing to identify this record by. The source document may have it.",
  unresolvable_country: "A number cannot be normalised without knowing the country.",
  orphaned_reference: "This points at a record that did not import. Find the parent, or discard.",
  conflicting_status: "The source asserts two things that cannot both be true.",
  out_of_scope: "Deliberately not migrated in this wave. Confirm that is still right.",
};

export const QUARANTINE_STATE_LABEL: Record<QuarantineState, string> = {
  open: "Open",
  resolved: "Resolved",
  discarded: "Discarded",
};

export const DISPOSITION_LABEL: Record<ImportDisposition, string> = {
  accepted: "Accepted",
  warning: "Warning",
  rejected: "Rejected",
};

/**
 * The migration plan's §17 gate, `Before member-data migration`.
 *
 * Rendered as an unchecked list rather than as progress. Nothing here is
 * measured by the console, and a checklist that ticks itself off is the fastest
 * way to make a gate decorative.
 */
export const MEMBER_DATA_GATE = [
  "A full dry run has been performed against a copy of production.",
  "Counts and financial totals reconcile, per entity and per year.",
  "Every rejection carries a documented reason.",
  "Deduplication rules were approved in writing before the run.",
  "A stated number of records has been read by a human.",
  "Access controls and audit logs have been reviewed on the target.",
  "A rehearsed rollback exists, and the rollback window is agreed.",
] as const;
