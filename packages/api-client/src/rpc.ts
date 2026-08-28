/**
 * Contract §5 — thin wrappers over the two `SECURITY DEFINER` functions.
 *
 * Thin is the point. Every business rule (the row lock, the capacity count, the
 * deadline, price resolution from membership state, ticket generation, the audit
 * row, the idempotent check-in) lives inside the database. Nothing in this file
 * re-decides any of it; it binds arguments, maps errors, and parses the result.
 */

import { normalizeTicketCode } from "@csa/domain";
import type { CheckInResult, Registration, RegistrationErrorCode, Uuid } from "@csa/domain";
import {
  checkInTicketResultSchema,
  parseRegisterForEventResult,
  registerForEventInputSchema,
  toCheckInTicketArgs,
  toRegisterForEventArgs,
  toRegistrationErrorCode,
  uuidSchema,
} from "@csa/validation";
import type { CheckInTicketInput } from "@csa/validation";

import { withSession } from "./db";

/* -------------------------------------------------------------------------- */
/* Errors                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Contract §5. The token is the exception MESSAGE and the human sentence is in
 * DETAIL, under SQLSTATE class `CSA`, which PostgreSQL does not use.
 *
 * This is the wider set the database actually raises. `RegistrationErrorCode` in
 * `@csa/domain` is the three-value subset the UI has copy for; `already_registered`
 * and `forbidden` are raised by the function and mapped to HTTP status codes in
 * contract §13, but are not in that union. Both are reported here.
 */
export const CSA_ERROR_TOKENS = [
  "invalid_arguments",
  "event_not_published",
  "registration_closed",
  "event_full",
  "event_not_found",
  "already_registered",
  "ticket_code_exhausted",
  "user_not_found",
  "forbidden",
] as const;

export type CsaErrorToken = (typeof CSA_ERROR_TOKENS)[number];

export function isCsaErrorToken(value: unknown): value is CsaErrorToken {
  return typeof value === "string" && (CSA_ERROR_TOKENS as readonly string[]).includes(value);
}

/** A named failure raised by `register_for_event` or `check_in_ticket`. */
export class CsaError extends Error {
  /**
   * The contract §5 token — `event_full`, `already_registered`, `forbidden`, …
   * A raw message when the database raised a CSA-class condition this list does
   * not name (`registration_failed`, for instance), so nothing is swallowed.
   */
  readonly code: CsaErrorToken | (string & {});

  /** The SQLSTATE, e.g. `CSA03`. */
  readonly sqlState: string;

  /** The human sentence the function put in DETAIL. */
  readonly detail: string | null;

  /**
   * The same failure narrowed to the union `@csa/domain` models, via
   * `toRegistrationErrorCode`. Null for tokens outside it — switch on
   * {@link code} when you need those.
   */
  readonly registrationErrorCode: RegistrationErrorCode | null;

  constructor(init: {
    code: string;
    sqlState: string;
    detail: string | null;
    registrationErrorCode: RegistrationErrorCode | null;
    cause?: unknown;
  }) {
    super(init.code, init.cause === undefined ? undefined : { cause: init.cause });
    this.name = "CsaError";
    this.code = init.code;
    this.sqlState = init.sqlState;
    this.detail = init.detail;
    this.registrationErrorCode = init.registrationErrorCode;
  }
}

export function isCsaError(value: unknown): value is CsaError {
  return value instanceof CsaError;
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" && value !== "" ? value : null;
}

/**
 * Recognises the failures the contract defines and leaves everything else alone.
 *
 * Two sources map to a `CsaError`:
 *   - SQLSTATE class `CSA*`, which is the function raising a named condition;
 *   - `42501 insufficient_privilege`, which is a caller with no EXECUTE grant on
 *     the function — a guest reaching a members-only RPC. Contract §13 calls
 *     that `forbidden`, and the GRANT layer refusing before the function body
 *     runs is the same refusal by a different mechanism.
 *
 * Anything else (a dropped connection, a syntax error) is returned as null so
 * the caller rethrows it untouched rather than dressing a bug up as a business
 * rule.
 */
export function toCsaError(error: unknown): CsaError | null {
  if (isCsaError(error)) return error;
  if (typeof error !== "object" || error === null) return null;

  const record = error as Record<string, unknown>;
  const sqlState = stringOrNull(record["code"]);
  if (sqlState === null) return null;

  const detail = stringOrNull(record["detail"]);

  if (sqlState === "42501") {
    return new CsaError({
      code: "forbidden",
      sqlState,
      detail: detail ?? stringOrNull(record["message"]),
      registrationErrorCode: null,
      cause: error,
    });
  }

  if (!sqlState.startsWith("CSA")) return null;

  return new CsaError({
    code: stringOrNull(record["message"]) ?? sqlState,
    sqlState,
    detail,
    // The helper already in @csa/validation is the single definition of this
    // mapping; it recognises only the three codes the domain union carries.
    registrationErrorCode: toRegistrationErrorCode(error),
    cause: error,
  });
}

function rethrow(error: unknown): never {
  throw toCsaError(error) ?? error;
}

/* -------------------------------------------------------------------------- */
/* register_for_event                                                         */
/* -------------------------------------------------------------------------- */

/**
 * Contract §5. Raises {@link CsaError} on every named failure and never returns
 * null: the price, the ticket code and the payment status in the result are the
 * ones the database committed, not a client's guess at them.
 *
 * `as` is both the session identity and `p_user_id`. The function's own
 * authorisation check allows staff and admin to register somebody else; this
 * wrapper does not expose that, because the frozen surface has no seat for a
 * second user id.
 */
export async function registerForEvent(as: Uuid, eventId: Uuid): Promise<Registration> {
  const args = toRegisterForEventArgs(registerForEventInputSchema.parse({ eventId, userId: as }));

  try {
    const rows = await withSession(as, (sql) =>
      sql`select * from register_for_event(${args.p_event_id}::uuid, ${args.p_user_id}::uuid)`.then(
        (result) => [...result],
      ),
    );

    const row = rows[0];
    if (row === undefined) {
      throw new Error("register_for_event returned no row");
    }
    return parseRegisterForEventResult(row);
  } catch (error) {
    rethrow(error);
  }
}

/* -------------------------------------------------------------------------- */
/* check_in_ticket                                                            */
/* -------------------------------------------------------------------------- */

/**
 * Normalises the flat `check_in_result` composite before `@csa/validation` sees it.
 *
 * On an `invalid` outcome the function returns the *scanned* code in
 * `ticket_code` while the three registration columns are null, and
 * `checkInTicketResultSchema` — correctly — refuses a half-populated ticket. It
 * is also free to be a code that matches no ticket shape at all, since the whole
 * point of `invalid` is that nothing matched.
 *
 * No registration id means no ticket, so the ticket columns are cleared together.
 * The scanned code is not lost: `check_in_ticket` has already written it to
 * `scan_attempts`, and `scan_attempt_id` in the result points straight at that row.
 */
export function normalizeCheckInResultRow(row: unknown): unknown {
  if (typeof row !== "object" || row === null) return row;

  const record = row as Record<string, unknown>;
  if (record["registration_id"] !== null && record["registration_id"] !== undefined) return record;

  return { ...record, event_id: null, user_id: null, ticket_code: null };
}

/**
 * Contract §5. Records the scan whatever the outcome, and returns `duplicate`
 * with the canonical `checked_in_at` rather than an error on a repeat.
 *
 * The ticket code is normalised with the same Crockford rules the database
 * applies (`normalise_ticket_code`) but is deliberately **not** rejected here
 * when it is malformed. "Every scan is recorded, whatever the outcome" is a
 * database guarantee, and a client that refused to send a garbled scan would be
 * the one breaking it — the evidence row for a bad badge is exactly the row
 * worth having. A malformed code simply comes back as `invalid`.
 *
 * `as` must be a `staff` or `admin` identity; anyone else gets a `forbidden`
 * {@link CsaError} from the function itself.
 */
export async function checkInTicket(as: Uuid, input: CheckInTicketInput): Promise<CheckInResult> {
  const args = toCheckInTicketArgs({
    ...input,
    ticketCode: normalizeTicketCode(input.ticketCode),
    eventId: uuidSchema.parse(input.eventId),
  });

  try {
    const rows = await withSession(as, (sql) =>
      sql`
        select *
        from check_in_ticket(
          ${args.p_ticket_code},
          ${args.p_event_id}::uuid,
          ${args.p_scanned_at}::timestamptz,
          ${args.p_device_id}
        )
      `.then((result) => [...result]),
    );

    const row = rows[0];
    if (row === undefined) {
      throw new Error("check_in_ticket returned no row");
    }
    return checkInTicketResultSchema.parse(normalizeCheckInResultRow(row));
  } catch (error) {
    rethrow(error);
  }
}
