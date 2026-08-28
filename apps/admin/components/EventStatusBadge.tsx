import type { EventStatus } from "@csa/domain";

import { Badge, type BadgeTone } from "@/components/ui";

/**
 * `event_status` is a CLOSED enum (contract §3), so this map is exhaustive by
 * construction — adding a value is a schema change, and the compiler will point
 * here when one arrives.
 *
 * Extracted rather than written twice: the dashboard and the events list both
 * show it, and a status that reads "Sold out" on one screen and "Full" on the
 * other is the drift this rule exists to stop.
 *
 * Tone choice is deliberate on a red brand. `cancelled` is the only outright
 * failure, so it is the only `danger`; `sold_out` is a warning because it is a
 * state someone acts on rather than a fault; `published` is neutral because it
 * is the normal case, and marking the normal case green is badge inflation.
 */
const STATUS: Record<EventStatus, { tone: BadgeTone; label: string }> = {
  draft: { tone: "info", label: "Draft" },
  published: { tone: "neutral", label: "Published" },
  sold_out: { tone: "warning", label: "Sold out" },
  cancelled: { tone: "danger", label: "Cancelled" },
};

export function EventStatusBadge({ status }: { readonly status: EventStatus }) {
  const { tone, label } = STATUS[status];
  return <Badge tone={tone}>{label}</Badge>;
}
