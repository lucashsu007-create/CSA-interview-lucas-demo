/**
 * Contract §5, `check_in_ticket`, and the offline conflict rule.
 *
 * The authoritative check-in is the database function: it always writes a
 * `scan_attempts` row and it owns `checked_in_at`. These functions are the same
 * decision made locally, so a scanner with no connection can show the right
 * result immediately and still queue the call.
 */

import type { Registration } from "./entities";
import type { Uuid } from "./primitives";

/**
 * What a scan of a *known* registration would produce. `invalid` is absent by
 * construction: it means the ticket code matched no row, which needs a lookup.
 */
export type CheckInDecision =
  | { readonly outcome: "success" }
  | { readonly outcome: "duplicate"; readonly checkedInAt: Date }
  | {
      readonly outcome: "wrong_event";
      readonly ticketEventId: Uuid;
      readonly scannedEventId: Uuid;
    };

/**
 * Order matters and matches the database: wrong event is decided before
 * duplicate, so a ticket already used at its own event and then presented at a
 * different one reads as `wrong_event`, not `duplicate`.
 */
export function canCheckIn(registration: Registration, eventId: Uuid): CheckInDecision {
  if (registration.eventId !== eventId) {
    return {
      outcome: "wrong_event",
      ticketEventId: registration.eventId,
      scannedEventId: eventId,
    };
  }

  const checkedInAt = registration.checkedInAt ?? null;
  if (checkedInAt !== null) {
    // A repeat scan returns the canonical time. It is not an error, and it
    // does not create a second record.
    return { outcome: "duplicate", checkedInAt };
  }

  return { outcome: "success" };
}

/**
 * What `check_in_ticket` returns about the scanned ticket. Deliberately not a
 * full `Registration`: the database composite carries only what a scanner needs
 * at the door, so building a `Registration` here would mean a second query for
 * fields nobody reads mid-queue.
 */
export interface ScannedTicket {
  readonly registrationId: Uuid;
  readonly eventId: Uuid;
  readonly userId: Uuid;
  readonly ticketCode: string;
}

/**
 * The result of the `check_in_ticket` RPC, discriminated on `outcome`.
 *
 * `scanAttemptId` is present on every outcome, including rejections, because
 * the database records every scan attempt before deciding anything. That id is
 * the audit handle for the scan that just happened.
 */
export type CheckInResult =
  | {
      readonly outcome: "success";
      readonly ticket: ScannedTicket;
      readonly checkedInAt: Date;
      readonly scanAttemptId: Uuid;
    }
  | {
      readonly outcome: "duplicate";
      readonly ticket: ScannedTicket;
      /**
       * The *canonical* check-in, which is the earliest reported scan — not
       * necessarily the first one the server saw. A queued offline scan that
       * reports an earlier time lowers this value.
       */
      readonly checkedInAt: Date;
      readonly scanAttemptId: Uuid;
    }
  | {
      readonly outcome: "wrong_event";
      /** Null if the server chose not to disclose another event's ticket. */
      readonly ticket: ScannedTicket | null;
      readonly scanAttemptId: Uuid;
    }
  | { readonly outcome: "invalid"; readonly scanAttemptId: Uuid };

/**
 * Contract §5 step 5: `checked_in_at = least(p_scanned_at, now())`, and the
 * conflict rule that the canonical time is the earliest reported scan. A
 * scanner's clock ahead of the server never books a check-in in the future.
 */
export function resolveCheckedInAt(scannedAt: Date, serverNow: Date): Date {
  return scannedAt.getTime() <= serverNow.getTime() ? scannedAt : serverNow;
}
