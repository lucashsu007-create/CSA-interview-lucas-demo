import type { ComponentType, ReactNode } from "react";

import { cn } from "@/lib/cn";

/**
 * Empty is one of four distinct states, and it is the one that carries EXACTLY
 * ONE action. Two actions in an empty state means the screen has not decided
 * what the reader should do next.
 *
 * Centred on purpose — an empty state and a hero are the two things that get
 * centred; everything else is left-aligned.
 *
 * Honesty note: an empty state is the correct rendering for "the database
 * genuinely has none of these". It is not a fallback for "we did not fetch
 * it" — that is `ErrorState` — and it is never a place to render a plausible
 * zero over a number that was not measured.
 */

export interface EmptyStateProps {
  readonly icon?: ComponentType<{ className?: string }>;
  readonly title: string;
  /** One or two sentences. Say what would put something here. */
  readonly body?: ReactNode;
  /** Exactly one, or none. */
  readonly action?: ReactNode;
  readonly className?: string;
}

export function EmptyState({ icon: Icon, title, body, action, className }: EmptyStateProps) {
  return (
    <div className={cn("flex flex-col items-center px-5 py-10 text-center", className)}>
      {Icon ? <Icon className="mb-3 size-6 text-surface-card-ink-muted" /> : null}
      <p className="text-body font-semibold text-surface-card-ink">{title}</p>
      {body ? (
        <p className="mt-1 max-w-sm text-bodySm text-surface-card-ink-muted">{body}</p>
      ) : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}
