/**
 * What a transform produces: target rows, and the account of how they got there.
 *
 * Nothing here is written yet. The transform is a pure function from an extract
 * to these drafts, which is what makes `dry_run` a real mode rather than a
 * flag that skips the commit — the whole transform, every rule, every
 * quarantine decision, runs and reports without a database in sight.
 */
import type {
  ImportDisposition,
  LegacySystem,
  MembershipStatus,
  MembershipType,
  PaymentStatus,
  QuarantineReason,
  EventCategory,
  EventStatus,
} from "@csa/domain";

import type { RuleName } from "./rules";

/** Where a row came from. The pair is the importer's idempotency key. */
export interface SourceKey {
  readonly sourceSystem: LegacySystem;
  readonly sourceId: string;
}

export interface ImportRecordDraft extends SourceKey {
  readonly entityType: string;
  readonly disposition: ImportDisposition;
  readonly appliedRules: readonly RuleName[];
  readonly detail?: string;
  /** The bucket year, so the report and the reconciliation agree. */
  readonly year: string;
}

export interface QuarantineDraft extends SourceKey {
  readonly entityType: string;
  readonly reason: QuarantineReason;
  readonly payload: Readonly<Record<string, unknown>>;
  readonly year: string;
  readonly paymentStatus?: PaymentStatus;
  readonly amountCents?: number;
}

export interface DedupDraft {
  readonly entityType: string;
  readonly rule: RuleName;
  readonly winner: SourceKey;
  readonly merged: SourceKey;
  readonly year: string;
}

export interface UserDraft extends SourceKey {
  readonly email: string;
  readonly fullName: string;
  readonly year: string;
}

export interface MembershipDraft extends SourceKey {
  /** The user this period belongs to, by normalised email — resolved at load. */
  readonly userEmail: string;
  readonly memberNumber: string;
  readonly membershipType: MembershipType;
  readonly status: MembershipStatus;
  readonly startsAt: Date;
  readonly expiresAt: Date;
  readonly year: string;
}

export interface EventDraft extends SourceKey {
  readonly title: string;
  readonly description: string;
  readonly category: EventCategory;
  readonly location: string;
  readonly startsAt: Date;
  readonly registrationDeadlineAt: Date;
  readonly capacity: number;
  readonly priceMemberCents: number;
  readonly pricePublicCents: number;
  readonly status: EventStatus;
  readonly year: string;
}

export interface RegistrationDraft extends SourceKey {
  readonly eventSourceId: string;
  readonly userEmail: string;
  readonly year: string;
}

export interface PaymentDraft extends SourceKey {
  /** The membership this payment settled, by its MongoDB oid. */
  readonly membershipSourceId: string;
  readonly amountCents: number;
  readonly status: PaymentStatus;
  readonly year: string;
}

export interface TransformResult {
  readonly users: readonly UserDraft[];
  readonly memberships: readonly MembershipDraft[];
  readonly events: readonly EventDraft[];
  readonly registrations: readonly RegistrationDraft[];
  readonly payments: readonly PaymentDraft[];
  readonly records: readonly ImportRecordDraft[];
  readonly quarantine: readonly QuarantineDraft[];
  readonly dedup: readonly DedupDraft[];
  /**
   * Fields present in the source and deliberately not carried across, with the
   * reason. GDPR applies to the target, not only to the source, so a field
   * nobody named a use for is dropped — and dropping it silently would make
   * that a mistake rather than a decision.
   */
  readonly minimisedFields: readonly string[];
}

/** The year a row belongs to for bucketing, or `unknown` when nothing said. */
export function bucketYear(raw: string | undefined | null): string {
  return /(\d{4})/.exec(raw ?? "")?.[1] ?? "unknown";
}
