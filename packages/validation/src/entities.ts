/**
 * Schemas for the camelCase domain objects themselves — for validating what a
 * client is about to send, what a cache is about to store, or what a test built
 * by hand.
 *
 * The `Matches` assertions at the bottom are compile-time proof that each schema
 * and its domain type are the same shape. If either side gains, loses or renames
 * a field, the package stops compiling instead of failing at runtime.
 */

import type {
  AnalyticsEvent,
  AuditEvent,
  Event,
  MembershipPeriod,
  Partner,
  Payment,
  Registration,
  ScanAttempt,
  User,
} from "@csa/domain";
import { z } from "zod";

import {
  analyticsEventNameSchema,
  checkInOutcomeSchema,
  eventCategorySchema,
  eventStatusSchema,
  membershipStatusSchema,
  membershipTypeSchema,
  paymentProviderSchema,
  paymentStatusSchema,
  userRoleSchema,
} from "./enums";
import {
  capacitySchema,
  emailSchema,
  jsonObjectSchema,
  nonEmptyStringSchema,
  nonNegativeCentsSchema,
  ticketCodeSchema,
  uuidSchema,
} from "./primitives";
import type { Assert, Exact } from "./type-utils";

export const userSchema = z.object({
  id: uuidSchema,
  email: emailSchema,
  fullName: nonEmptyStringSchema,
  role: userRoleSchema,
  createdAt: z.date(),
});

export const membershipPeriodSchema = z.object({
  id: uuidSchema,
  userId: uuidSchema,
  memberNumber: nonEmptyStringSchema,
  membershipType: membershipTypeSchema,
  status: membershipStatusSchema,
  startsAt: z.date(),
  expiresAt: z.date(),
  createdAt: z.date(),
});

export const eventSchema = z.object({
  id: uuidSchema,
  title: nonEmptyStringSchema,
  description: z.string(),
  category: eventCategorySchema,
  location: z.string(),
  startsAt: z.date(),
  registrationDeadlineAt: z.date(),
  capacity: capacitySchema,
  priceMemberCents: nonNegativeCentsSchema,
  pricePublicCents: nonNegativeCentsSchema,
  status: eventStatusSchema,
  imageUrl: z.string().nullable(),
  createdAt: z.date(),
});

export const registrationSchema = z.object({
  id: uuidSchema,
  eventId: uuidSchema,
  userId: uuidSchema,
  ticketCode: ticketCodeSchema,
  pricePaidCents: nonNegativeCentsSchema,
  isMemberPrice: z.boolean(),
  paymentStatus: paymentStatusSchema,
  checkedInAt: z.date().nullable(),
  createdAt: z.date(),
});

export const paymentSchema = z.object({
  id: uuidSchema,
  registrationId: uuidSchema,
  provider: paymentProviderSchema,
  providerReference: nonEmptyStringSchema,
  amountCents: nonNegativeCentsSchema,
  status: paymentStatusSchema,
  createdAt: z.date(),
});

export const scanAttemptSchema = z.object({
  id: uuidSchema,
  ticketCode: z.string(),
  eventId: uuidSchema,
  deviceId: nonEmptyStringSchema,
  scannedAt: z.date(),
  receivedAt: z.date(),
  outcome: checkInOutcomeSchema,
  createdAt: z.date(),
});

export const partnerSchema = z.object({
  id: uuidSchema,
  name: nonEmptyStringSchema,
  city: z.string(),
  category: z.string(),
  discountText: z.string(),
  address: z.string(),
});

export const auditEventSchema = z.object({
  id: uuidSchema,
  actorUserId: uuidSchema,
  action: nonEmptyStringSchema,
  entityType: nonEmptyStringSchema,
  entityId: uuidSchema,
  metadata: jsonObjectSchema,
  createdAt: z.date(),
});

export const analyticsEventSchema = z.object({
  id: uuidSchema,
  name: analyticsEventNameSchema,
  userId: uuidSchema.nullable(),
  properties: jsonObjectSchema,
  createdAt: z.date(),
});

/* -------------------------------------------------------------------------- */
/* Compile-time shape assertions                                              */
/* -------------------------------------------------------------------------- */

export type _UserMatches = Assert<Exact<User, z.infer<typeof userSchema>>>;
export type _MembershipPeriodMatches = Assert<
  Exact<MembershipPeriod, z.infer<typeof membershipPeriodSchema>>
>;
export type _EventMatches = Assert<Exact<Event, z.infer<typeof eventSchema>>>;
export type _RegistrationMatches = Assert<Exact<Registration, z.infer<typeof registrationSchema>>>;
export type _PaymentMatches = Assert<Exact<Payment, z.infer<typeof paymentSchema>>>;
export type _ScanAttemptMatches = Assert<Exact<ScanAttempt, z.infer<typeof scanAttemptSchema>>>;
export type _PartnerMatches = Assert<Exact<Partner, z.infer<typeof partnerSchema>>>;
export type _AuditEventMatches = Assert<Exact<AuditEvent, z.infer<typeof auditEventSchema>>>;
export type _AnalyticsEventMatches = Assert<
  Exact<AnalyticsEvent, z.infer<typeof analyticsEventSchema>>
>;
