import type { HTMLAttributes, ReactNode } from "react";

import { cn } from "@/lib/cn";

/**
 * The panel every dashboard and list surface is built from.
 *
 * Elevation is meaning, and nothing in the committee register has lifted, so
 * there is no elevation prop: a card is a hairline border and no shadow. The
 * one surface that genuinely sits above the page — the identity menu — uses
 * `shadow-overlay` directly, which is the token for exactly that.
 */

export type CardProps = HTMLAttributes<HTMLDivElement>;

export function Card({ className, ...props }: CardProps) {
  return (
    <div
      className={cn(
        "focus-ground-card rounded-card border border-surface-card-hairline bg-surface-card-ground text-surface-card-ink",
        className,
      )}
      {...props}
    />
  );
}

export interface CardHeaderProps {
  readonly title: ReactNode;
  /** One line at most. If it needs two, it is body content, not a subtitle. */
  readonly subtitle?: ReactNode;
  /** A single control, or nothing. Two controls in a header is a toolbar. */
  readonly action?: ReactNode;
  readonly className?: string;
}

export function CardHeader({ title, subtitle, action, className }: CardHeaderProps) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-start justify-between gap-3 border-b border-surface-card-hairline px-5 py-4",
        className,
      )}
    >
      <div className="min-w-0">
        <h2 className="text-title text-surface-card-ink">{title}</h2>
        {subtitle ? (
          <p className="mt-1 text-bodySm text-surface-card-ink-muted">{subtitle}</p>
        ) : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

export function CardBody({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("px-5 py-4", className)} {...props} />;
}
