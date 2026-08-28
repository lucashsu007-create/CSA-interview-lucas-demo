/**
 * Contract §4. One TypeScript type per table, camelCase, mapping mechanically to
 * the snake_case columns (`member_number` <-> `memberNumber`).
 *
 * Timestamps are `Date` here, not strings: the domain predicates compare them,
 * and the conversion from the wire form happens exactly once, in
 * `@csa/validation`'s row parsers.
 */

import type {
  AnalyticsEventName,
  CheckInOutcome,
  EventCategory,
  EventStatus,
  MembershipStatus,
  MembershipType,
  PaymentProvider,
  PaymentStatus,
  UserRole,
} from "./enums";
import type { Cents } from "./money";
import type { JsonObject, Uuid } from "./primitives";

/** `users` */
export interface User {
  readonly id: Uuid;
  /** Unique, `citext` — compare case-insensitively. */
  readonly email: string;
  readonly fullName: string;
  /** Permissions only. Never an input to pricing. */
  readonly role: UserRole;
  readonly createdAt: Date;
}

/** `membership_periods` — a user may have several; at most one is active. */
export interface MembershipPeriod {
  readonly id: Uuid;
  readonly userId: Uuid;
  readonly memberNumber: string;
  readonly membershipType: MembershipType;
  readonly status: MembershipStatus;
  readonly startsAt: Date;
  readonly expiresAt: Date;
  readonly createdAt: Date;
}

/**
 * `events`
 *
 * Named `Event` to match the contract. That shadows the DOM global inside any
 * module that imports it, so {@link CsaEvent} is exported as an alias for
 * modules that need both.
 */
export interface Event {
  readonly id: Uuid;
  readonly title: string;
  readonly description: string;
  readonly category: EventCategory;
  readonly location: string;
  readonly startsAt: Date;
  readonly registrationDeadlineAt: Date;
  /** `CHECK (capacity > 0)`. */
  readonly capacity: number;
  readonly priceMemberCents: Cents;
  readonly pricePublicCents: Cents;
  readonly status: EventStatus;
  readonly imageUrl: string | null;
  readonly createdAt: Date;
}

/** Alias for {@link Event}, for modules that also use the DOM `Event`. */
export type CsaEvent = Event;

/** `registrations` — unique on `(event_id, user_id)`. */
export interface Registration {
  readonly id: Uuid;
  readonly eventId: Uuid;
  readonly userId: Uuid;
  /** 10 Crockford base32 characters from a CSPRNG. Contract §6. */
  readonly ticketCode: string;
  readonly pricePaidCents: Cents;
  /** Set by the server from membership state at registration time, never from role. */
  readonly isMemberPrice: boolean;
  readonly paymentStatus: PaymentStatus;
  /** Null until the first accepted scan. Never overwritten by a later scan. */
  readonly checkedInAt: Date | null;
  readonly createdAt: Date;
}

/** `payments` */
export interface Payment {
  readonly id: Uuid;
  readonly registrationId: Uuid;
  readonly provider: PaymentProvider;
  readonly providerReference: string;
  readonly amountCents: Cents;
  readonly status: PaymentStatus;
  readonly createdAt: Date;
}

/**
 * `scan_attempts` — every scan lands here, including duplicates and rejections.
 * This table is the evidence for the offline-sync story.
 */
export interface ScanAttempt {
  readonly id: Uuid;
  readonly ticketCode: string;
  /** The event the scanner was configured for, not necessarily the ticket's event. */
  readonly eventId: Uuid;
  readonly deviceId: string;
  /** The scanner's reported time. Trusted only up to `receivedAt`. */
  readonly scannedAt: Date;
  /** Server time at ingest. */
  readonly receivedAt: Date;
  readonly outcome: CheckInOutcome;
  readonly createdAt: Date;
}

/** `partners` */
export interface Partner {
  readonly id: Uuid;
  readonly name: string;
  readonly city: string;
  /** Free text — the contract defines no closed enum for partner categories. */
  readonly category: string;
  readonly discountText: string;
  readonly address: string;
}

/** `audit_events` */
export interface AuditEvent {
  readonly id: Uuid;
  readonly actorUserId: Uuid;
  readonly action: string;
  readonly entityType: string;
  readonly entityId: Uuid;
  readonly metadata: JsonObject;
  readonly createdAt: Date;
}

/** `analytics_events` */
export interface AnalyticsEvent {
  readonly id: Uuid;
  readonly name: AnalyticsEventName;
  /** Null for events from an unauthenticated visitor. */
  readonly userId: Uuid | null;
  readonly properties: JsonObject;
  readonly createdAt: Date;
}
