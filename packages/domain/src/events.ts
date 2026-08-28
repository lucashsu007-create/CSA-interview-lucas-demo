/**
 * Contract §5, `register_for_event` steps 2 and 3.
 *
 * Deliberately does not consider capacity. Capacity is only safe to evaluate
 * under `SELECT ... FOR UPDATE` inside the registration transaction; a client
 * that checked it would be reading a number that can change before the insert.
 * The UI reads `status = 'sold_out'` for that, and the server is the referee.
 */

import type { EventStatus } from "./enums";
import type { RegistrationErrorCode } from "./errors";

/** The minimum shape of an event needed to test its registration window. */
export interface EventRegistrationWindow {
  readonly status: EventStatus;
  readonly registrationDeadlineAt: Date;
}

/**
 * Open when the event is published and the deadline has not passed.
 *
 * The database rejects only when `now() > registration_deadline_at`, so an
 * instant exactly equal to the deadline is still open. This matches it.
 */
export function isRegistrationOpen(event: EventRegistrationWindow, at: Date): boolean {
  return event.status === "published" && at.getTime() <= event.registrationDeadlineAt.getTime();
}

/**
 * Why registration is closed, in the same order the database checks, so the
 * client's message matches the error the server would have raised. Null when
 * registration is open. `event_full` is never returned here — see the note above.
 */
export function registrationClosedReason(
  event: EventRegistrationWindow,
  at: Date,
): RegistrationErrorCode | null {
  if (event.status !== "published") return "event_not_published";
  if (at.getTime() > event.registrationDeadlineAt.getTime()) return "registration_closed";
  return null;
}
