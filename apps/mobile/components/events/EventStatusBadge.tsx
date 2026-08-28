/**
 * What state an event is in, as one badge.
 *
 * The predicate is `isRegistrationOpen` from `@csa/domain`, which reproduces the
 * database's own boundary (`now() > registration_deadline_at`, so the deadline
 * instant itself is still open). The component does not re-implement it —
 * a screen that decided for itself when registration closes would be a second
 * source of truth, and the two would disagree at exactly the wrong moment.
 *
 * Capacity is deliberately absent from that predicate: it is only safe to judge
 * under the row lock inside the registration transaction. The UI reads
 * `status = 'sold_out'` and lets the server be the referee.
 */
import { isRegistrationOpen, type EventStatus } from "@csa/domain";

import { Badge } from "@/components/ui/Badge";

export interface EventStatusBadgeProps {
  status: EventStatus;
  registrationDeadlineAt: Date;
  startsAt: Date;
  now: Date;
}

export function EventStatusBadge({
  status,
  registrationDeadlineAt,
  startsAt,
  now,
}: EventStatusBadgeProps) {
  if (status === "cancelled") return <Badge label="Cancelled" tone="danger" />;
  if (status === "sold_out") return <Badge label="Sold out" tone="danger" />;
  if (startsAt.getTime() < now.getTime()) return <Badge label="Past event" tone="neutral" />;
  if (!isRegistrationOpen({ status, registrationDeadlineAt }, now)) {
    return <Badge label="Registration closed" tone="warning" />;
  }
  return <Badge label="Open" tone="success" />;
}
