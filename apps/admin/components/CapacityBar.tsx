import { cn } from "@/lib/cn";
import { percentOf } from "@/lib/format";

/**
 * How full an event is, drawn from two numbers the SERVER produced.
 *
 * `registeredCount` and `spotsRemaining` ride along on `EventListItem`
 * precisely so no screen computes capacity itself — capacity is only safe to
 * evaluate under `SELECT … FOR UPDATE` inside `register_for_event`, and a
 * number this component derived would be one that can change before the next
 * statement. So the fill is a rendering of a fact, not a calculation.
 *
 * The fill is brand red at every level. It does NOT turn red when full, because
 * on this palette the brand is already red and a red-means-danger fill would be
 * indistinguishable from ordinary chrome — the "left"/"Full" text beside it is
 * the signal that changes, and it is a word rather than a hue.
 */
export function CapacityBar({
  registered,
  capacity,
  className,
}: {
  readonly registered: number;
  readonly capacity: number;
  readonly className?: string;
}) {
  const percent = percentOf(registered, capacity);

  /* No capacity recorded is not the same fact as an empty event. Saying so
   * beats drawing an empty bar that reads as "nobody has signed up". */
  if (percent === null) {
    return (
      <p className={cn("text-caption text-surface-card-ink-muted", className)}>
        No capacity recorded
      </p>
    );
  }

  return (
    <span
      aria-hidden
      className={cn(
        "block h-2 w-full overflow-hidden rounded-pill border border-surface-sunken-hairline bg-surface-sunken-ground",
        className,
      )}
    >
      <span
        className="block h-full rounded-pill bg-brand-solid-ground"
        style={{ width: `${Math.min(percent, 100)}%` }}
      />
    </span>
  );
}

/**
 * The same two numbers as words, which is what assistive tech and a hurried
 * reader both actually use. Tabular figures because these sit in a column and
 * get compared against each other.
 */
export function CapacityLabel({
  registered,
  capacity,
  remaining,
}: {
  readonly registered: number;
  readonly capacity: number;
  readonly remaining: number;
}) {
  return (
    <span className="numeric text-bodySm whitespace-nowrap text-surface-card-ink">
      {registered}
      <span className="text-surface-card-ink-muted"> / {capacity}</span>
      <span className="ml-2 text-caption text-surface-card-ink-muted">
        {remaining <= 0 ? "Full" : `${remaining} left`}
      </span>
    </span>
  );
}
