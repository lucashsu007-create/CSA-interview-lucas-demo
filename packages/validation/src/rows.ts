/**
 * The raw shape of each table as it arrives from PostgREST: snake_case keys,
 * timestamps as strings, money as integers.
 *
 * These schemas validate; they do not rename. Renaming happens once, in
 * `parsers.ts`.
 */

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
  isoDateTimeSchema,
  jsonObjectSchema,
  nonEmptyStringSchema,
  nonNegativeCentsSchema,
  ticketCodeSchema,
  uuidSchema,
} from "./primitives";

export const userRowSchema = z.object({
  id: uuidSchema,
  email: emailSchema,
  full_name: nonEmptyStringSchema,
  role: userRoleSchema,
  created_at: isoDateTimeSchema,
});
export type UserRow = z.infer<typeof userRowSchema>;

export const membershipPeriodRowSchema = z.object({
  id: uuidSchema,
  user_id: uuidSchema,
  member_number: nonEmptyStringSchema,
  membership_type: membershipTypeSchema,
  status: membershipStatusSchema,
  starts_at: isoDateTimeSchema,
  expires_at: isoDateTimeSchema,
  created_at: isoDateTimeSchema,
});
export type MembershipPeriodRow = z.infer<typeof membershipPeriodRowSchema>;

export const eventRowSchema = z.object({
  id: uuidSchema,
  title: nonEmptyStringSchema,
  description: z.string(),
  category: eventCategorySchema,
  location: z.string(),
  starts_at: isoDateTimeSchema,
  registration_deadline_at: isoDateTimeSchema,
  capacity: capacitySchema,
  price_member_cents: nonNegativeCentsSchema,
  price_public_cents: nonNegativeCentsSchema,
  status: eventStatusSchema,
  image_url: z.string().nullable(),
  created_at: isoDateTimeSchema,
});
export type EventRow = z.infer<typeof eventRowSchema>;

export const registrationRowSchema = z.object({
  id: uuidSchema,
  event_id: uuidSchema,
  user_id: uuidSchema,
  ticket_code: ticketCodeSchema,
  price_paid_cents: nonNegativeCentsSchema,
  is_member_price: z.boolean(),
  payment_status: paymentStatusSchema,
  checked_in_at: isoDateTimeSchema.nullable(),
  created_at: isoDateTimeSchema,
});
export type RegistrationRow = z.infer<typeof registrationRowSchema>;

export const paymentRowSchema = z.object({
  id: uuidSchema,
  registration_id: uuidSchema,
  provider: paymentProviderSchema,
  provider_reference: nonEmptyStringSchema,
  amount_cents: nonNegativeCentsSchema,
  status: paymentStatusSchema,
  created_at: isoDateTimeSchema,
});
export type PaymentRow = z.infer<typeof paymentRowSchema>;

export const scanAttemptRowSchema = z.object({
  id: uuidSchema,
  // Not `ticketCodeSchema`: an invalid scan records whatever was on the badge,
  // and that evidence is the point of the table.
  ticket_code: z.string(),
  event_id: uuidSchema,
  device_id: nonEmptyStringSchema,
  scanned_at: isoDateTimeSchema,
  received_at: isoDateTimeSchema,
  outcome: checkInOutcomeSchema,
  created_at: isoDateTimeSchema,
});
export type ScanAttemptRow = z.infer<typeof scanAttemptRowSchema>;

export const partnerRowSchema = z.object({
  id: uuidSchema,
  name: nonEmptyStringSchema,
  city: z.string(),
  category: z.string(),
  discount_text: z.string(),
  address: z.string(),
});
export type PartnerRow = z.infer<typeof partnerRowSchema>;

export const auditEventRowSchema = z.object({
  id: uuidSchema,
  actor_user_id: uuidSchema,
  action: nonEmptyStringSchema,
  entity_type: nonEmptyStringSchema,
  entity_id: uuidSchema,
  metadata: jsonObjectSchema,
  created_at: isoDateTimeSchema,
});
export type AuditEventRow = z.infer<typeof auditEventRowSchema>;

export const analyticsEventRowSchema = z.object({
  id: uuidSchema,
  name: analyticsEventNameSchema,
  user_id: uuidSchema.nullable(),
  properties: jsonObjectSchema,
  created_at: isoDateTimeSchema,
});
export type AnalyticsEventRow = z.infer<typeof analyticsEventRowSchema>;
