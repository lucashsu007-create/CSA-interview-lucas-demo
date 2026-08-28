/**
 * Contract §5 — the two `SECURITY DEFINER` functions that carry the demo.
 *
 * Three schemas per call, on purpose:
 *   - an `Input` in camelCase, which is what application code holds;
 *   - `Args` in the `p_`-prefixed shape PostgREST actually posts;
 *   - a `Result` that validates the returned row and hands back a domain object.
 *
 * The argument mapping lives here and nowhere else, for the same reason the
 * column mapping lives in `parsers.ts`.
 */

import type {
  CheckInResult,
  Registration,
  RegistrationErrorCode,
  ScannedTicket,
} from "@csa/domain";
import { REGISTRATION_ERROR_CODES } from "@csa/domain";
import { z } from "zod";

import { checkInOutcomeSchema } from "./enums";
import { toRegistration } from "./parsers";
import {
  isoDateTimeSchema,
  nonEmptyStringSchema,
  ticketCodeSchema,
  toDate,
  uuidSchema,
} from "./primitives";
import { registrationRowSchema } from "./rows";

/* -------------------------------------------------------------------------- */
/* register_for_event(p_event_id uuid, p_user_id uuid) -> registrations        */
/* -------------------------------------------------------------------------- */

export const registerForEventInputSchema = z.object({
  eventId: uuidSchema,
  userId: uuidSchema,
});
export type RegisterForEventInput = z.infer<typeof registerForEventInputSchema>;

export const registerForEventArgsSchema = z.object({
  p_event_id: uuidSchema,
  p_user_id: uuidSchema,
});
export type RegisterForEventArgs = z.infer<typeof registerForEventArgsSchema>;

export function toRegisterForEventArgs(input: RegisterForEventInput): RegisterForEventArgs {
  return {
    p_event_id: input.eventId,
    p_user_id: input.userId,
  };
}

/**
 * Accepts either a single row or a one-row array, because `RETURNS registrations`
 * and `RETURNS SETOF registrations` serialise differently and the client should
 * not break on that choice.
 */
export const registerForEventResultSchema = z
  .union([registrationRowSchema, z.array(registrationRowSchema).min(1)])
  .transform((value): Registration => {
    const row = Array.isArray(value) ? value[0] : value;
    if (row === undefined) {
      throw new TypeError("register_for_event returned an empty result set");
    }
    return toRegistration(row);
  });

export function parseRegisterForEventResult(value: unknown): Registration {
  return registerForEventResultSchema.parse(value);
}

/**
 * Contract §5: the function raises named SQLSTATE conditions and never returns
 * null on failure. This recognises those names in whatever field the client
 * library surfaces them in, so both clients map the same three failures without
 * pattern-matching prose.
 */
export function toRegistrationErrorCode(error: unknown): RegistrationErrorCode | null {
  const haystack =
    typeof error === "string"
      ? error
      : typeof error === "object" && error !== null
        ? [
            (error as { code?: unknown }).code,
            (error as { message?: unknown }).message,
            (error as { details?: unknown }).details,
            (error as { hint?: unknown }).hint,
          ]
            .filter((part): part is string => typeof part === "string")
            .join(" ")
        : "";

  return REGISTRATION_ERROR_CODES.find((code) => haystack.includes(code)) ?? null;
}

/* -------------------------------------------------------------------------- */
/* check_in_ticket(...) -> check_in_outcome + registration                     */
/* -------------------------------------------------------------------------- */

export const checkInTicketInputSchema = z.object({
  ticketCode: ticketCodeSchema,
  eventId: uuidSchema,
  /** The scanner's own clock. The server clamps it; see `resolveCheckedInAt`. */
  scannedAt: z.date(),
  deviceId: nonEmptyStringSchema,
});
export type CheckInTicketInput = z.infer<typeof checkInTicketInputSchema>;

export const checkInTicketArgsSchema = z.object({
  p_ticket_code: ticketCodeSchema,
  p_event_id: uuidSchema,
  p_scanned_at: isoDateTimeSchema,
  p_device_id: nonEmptyStringSchema,
});
export type CheckInTicketArgs = z.infer<typeof checkInTicketArgsSchema>;

export function toCheckInTicketArgs(input: CheckInTicketInput): CheckInTicketArgs {
  return {
    p_ticket_code: input.ticketCode,
    p_event_id: input.eventId,
    p_scanned_at: input.scannedAt.toISOString(),
    p_device_id: input.deviceId,
  };
}

const checkInTicketResultRowSchema = z.object({
  outcome: checkInOutcomeSchema,
  registration_id: uuidSchema.nullable(),
  event_id: uuidSchema.nullable(),
  user_id: uuidSchema.nullable(),
  ticket_code: ticketCodeSchema.nullable(),
  checked_in_at: isoDateTimeSchema.nullable(),
  scan_attempt_id: uuidSchema,
});

type CheckInTicketResultRow = z.infer<typeof checkInTicketResultRowSchema>;

/**
 * The database returns a flat `check_in_result` composite, not a nested
 * registration, so the ticket identity is reassembled here. All four ticket
 * columns are null together or present together; a partial row means
 * `check_in_ticket` returned something it did not write.
 */
function toScannedTicket(row: CheckInTicketResultRow): ScannedTicket | null {
  const { registration_id, event_id, user_id, ticket_code } = row;
  if (registration_id === null || event_id === null || user_id === null || ticket_code === null) {
    if (registration_id !== null || event_id !== null || user_id !== null || ticket_code !== null) {
      throw new TypeError("check_in_ticket returned a partially populated ticket");
    }
    return null;
  }
  return {
    registrationId: registration_id,
    eventId: event_id,
    userId: user_id,
    ticketCode: ticket_code,
  };
}

/**
 * Throws when the database reports `success` or `duplicate` without the ticket
 * or without a `checked_in_at`. That combination is not a client error to
 * tolerate — it means the function returned a record it did not write.
 */
export const checkInTicketResultSchema = checkInTicketResultRowSchema.transform(
  (row): CheckInResult => {
    const ticket = toScannedTicket(row);
    const scanAttemptId = row.scan_attempt_id;

    switch (row.outcome) {
      case "success":
      case "duplicate": {
        if (ticket === null) {
          throw new TypeError(`check_in_ticket returned ${row.outcome} without a ticket`);
        }
        if (row.checked_in_at === null) {
          throw new TypeError(`check_in_ticket returned ${row.outcome} without a checked_in_at`);
        }
        const checkedInAt = toDate(row.checked_in_at);
        return row.outcome === "success"
          ? { outcome: "success", ticket, checkedInAt, scanAttemptId }
          : { outcome: "duplicate", ticket, checkedInAt, scanAttemptId };
      }
      case "wrong_event":
        return { outcome: "wrong_event", ticket, scanAttemptId };
      case "invalid":
        return { outcome: "invalid", scanAttemptId };
    }
  },
);

export function parseCheckInTicketResult(value: unknown): CheckInResult {
  return checkInTicketResultSchema.parse(value);
}
