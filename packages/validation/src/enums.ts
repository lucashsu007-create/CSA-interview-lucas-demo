/**
 * Zod enums built from the `as const` arrays in `@csa/domain`. The values are
 * never retyped here, so a schema cannot drift from the union type or from the
 * database enum the arrays mirror.
 */

import {
  ANALYTICS_EVENT_NAMES,
  CHECK_IN_OUTCOMES,
  EVENT_CATEGORIES,
  EVENT_STATUSES,
  MEMBERSHIP_STATUSES,
  MEMBERSHIP_TYPES,
  PAYMENT_PROVIDERS,
  PAYMENT_STATUSES,
  REGISTRATION_ERROR_CODES,
  USER_ROLES,
} from "@csa/domain";
import { z } from "zod";

export const userRoleSchema = z.enum(USER_ROLES);
export const membershipTypeSchema = z.enum(MEMBERSHIP_TYPES);
export const membershipStatusSchema = z.enum(MEMBERSHIP_STATUSES);
export const eventCategorySchema = z.enum(EVENT_CATEGORIES);
export const eventStatusSchema = z.enum(EVENT_STATUSES);
export const paymentStatusSchema = z.enum(PAYMENT_STATUSES);
export const paymentProviderSchema = z.enum(PAYMENT_PROVIDERS);
export const checkInOutcomeSchema = z.enum(CHECK_IN_OUTCOMES);
export const analyticsEventNameSchema = z.enum(ANALYTICS_EVENT_NAMES);
export const registrationErrorCodeSchema = z.enum(REGISTRATION_ERROR_CODES);
