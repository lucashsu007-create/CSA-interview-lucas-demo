/**
 * Scalar schemas shared by every entity, RPC and endpoint schema.
 *
 * Formats are validated with explicit regexes rather than Zod's built-in format
 * helpers, which moved between Zod 3 and Zod 4. The regexes come from
 * `@csa/domain` wherever the format is a domain rule (ticket codes) so there is
 * one definition, not a copy.
 */

import { TICKET_CODE_REGEX, UUID_REGEX, isJson, isJsonObject } from "@csa/domain";
import type { Json, JsonObject } from "@csa/domain";
import { z } from "zod";

export const uuidSchema = z.string().regex(UUID_REGEX, "expected a uuid");

/** Loose on purpose: the column is `citext` and the demo domain is `.local`. */
export const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const emailSchema = z.string().regex(EMAIL_REGEX, "expected an email address");

export const nonEmptyStringSchema = z.string().min(1);

/**
 * Accepts both renderings of a `timestamptz` — `2026-06-01T18:00:00+00:00` and
 * the space-separated `2026-06-01 18:00:00+00` some drivers emit.
 */
export const ISO_DATE_TIME_REGEX =
  /^\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2})?(?:\.\d+)?(?:Z|[+-]\d{2}(?::?\d{2})?)?)?$/;

export const isoDateTimeSchema = z
  .string()
  .regex(ISO_DATE_TIME_REGEX, "expected an ISO-8601 timestamp")
  .refine((value) => !Number.isNaN(parseTimestamp(value).getTime()), {
    message: "expected a parseable ISO-8601 timestamp",
  });

/**
 * Normalises the two Postgres renderings into something every JavaScript engine
 * parses identically, including Hermes.
 */
export function normalizeTimestamp(value: string): string {
  const withT = value.includes("T") ? value : value.replace(" ", "T");
  // A whole-hour offset can arrive as `+00`; ECMAScript requires `+00:00`.
  return /T\d{2}:\d{2}(?::\d{2})?(?:\.\d+)?[+-]\d{2}$/.test(withT) ? `${withT}:00` : withT;
}

function parseTimestamp(value: string): Date {
  return new Date(normalizeTimestamp(value));
}

/** The one conversion from wire timestamp to domain `Date`. */
export function toDate(value: string): Date {
  const date = parseTimestamp(value);
  if (Number.isNaN(date.getTime())) {
    throw new TypeError(`expected an ISO-8601 timestamp, received ${JSON.stringify(value)}`);
  }
  return date;
}

export function toDateOrNull(value: string | null | undefined): Date | null {
  return value === null || value === undefined ? null : toDate(value);
}

/** Contract §1: money is integer cents. A float never gets past this. */
export const centsSchema = z.number().int("expected integer cents");

/** Prices and payment amounts. Refunds are a status, not a negative amount. */
export const nonNegativeCentsSchema = centsSchema.min(0, "expected a non-negative amount");

export const capacitySchema = z.number().int().min(1, "capacity must be greater than zero");

export const ticketCodeSchema = z
  .string()
  .regex(TICKET_CODE_REGEX, "expected 10 Crockford base32 characters");

export const jsonSchema = z.custom<Json>(isJson, { message: "expected a JSON value" });

export const jsonObjectSchema = z.custom<JsonObject>(isJsonObject, {
  message: "expected a JSON object",
});
