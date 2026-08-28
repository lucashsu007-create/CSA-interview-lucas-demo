import { STATUS_SIGNAL } from "@csa/design-tokens";
import { CircleX } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/lib/cn";

/**
 * Error is a different state from empty, and the difference is load-bearing:
 * empty means the database has none of these, error means we do not know.
 * Rendering an error as an empty list is how a screen ends up showing an
 * honest-looking zero for a number nobody measured.
 *
 * `role="alert"` announces it to assistive tech; the retry is the one action.
 * The glyph is the token package's own danger signal, so colour is not the only
 * channel — which matters on a palette whose brand colour is already red.
 */

export interface ErrorStateProps {
  readonly title?: string;
  readonly detail?: ReactNode;
  /** A retry control. Render one unless retrying genuinely cannot help. */
  readonly action?: ReactNode;
  readonly className?: string;
}

export function ErrorState({
  title = "Could not load this",
  detail,
  action,
  className,
}: ErrorStateProps) {
  return (
    <div
      role="alert"
      className={cn(
        "flex flex-col items-start gap-2 rounded-card border border-status-danger-subtle-hairline bg-status-danger-subtle-ground px-5 py-4 text-status-danger-subtle-ink",
        className,
      )}
    >
      <p className="flex items-center gap-2 text-body font-semibold">
        <CircleX className="size-5 shrink-0" aria-hidden />
        <span className="sr-only">{STATUS_SIGNAL.danger.label}: </span>
        {title}
      </p>
      {detail ? <p className="text-bodySm text-status-danger-subtle-ink-muted">{detail}</p> : null}
      {action ? <div className="mt-1">{action}</div> : null}
    </div>
  );
}
