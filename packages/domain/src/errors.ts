/**
 * Contract §5: `register_for_event` raises named errors as SQLSTATE conditions
 * that the clients map to messages. It never returns null on failure.
 *
 * The codes live here so both clients map the same strings, and so the database
 * workstream has one list to raise from.
 */

export const REGISTRATION_ERROR_CODES = [
  "event_not_published",
  "registration_closed",
  "event_full",
  "already_registered",
  "forbidden",
] as const;

export type RegistrationErrorCode = (typeof REGISTRATION_ERROR_CODES)[number];

export function isRegistrationErrorCode(value: unknown): value is RegistrationErrorCode {
  return (
    typeof value === "string" && (REGISTRATION_ERROR_CODES as readonly string[]).includes(value)
  );
}

/** Default English copy. A localised client may substitute its own. */
export const REGISTRATION_ERROR_MESSAGES: Record<RegistrationErrorCode, string> = {
  event_not_published: "This event is not open for registration.",
  registration_closed: "Registration for this event has closed.",
  event_full: "This event is full.",
  already_registered: "You are already registered for this event.",
  forbidden: "You are not allowed to do that.",
};
