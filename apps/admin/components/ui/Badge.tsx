import { STATUS_SIGNAL, type StatusIconName, type StatusName } from "@csa/design-tokens";
import { CircleCheck, CircleX, Info, TriangleAlert } from "lucide-react";
import type { ComponentType, ReactNode } from "react";

import { cn } from "@/lib/cn";

/**
 * A badge marks a state that CHANGES. A label that is always the same on every
 * row is a column header, not a badge.
 *
 * Colour is never the only signal. The four status tones carry the Lucide glyph
 * the token package names for them — `STATUS_SIGNAL` is the source, so the icon
 * cannot drift from the role. CSA's brand colour is itself red, which makes
 * that second channel load-bearing rather than decorative here: a red chip does
 * not read as "error" on this palette the way it would on a blue-branded one.
 *
 * Radius is `control`, not `pill`. The pill is the button idiom, and a table of
 * pill-shaped non-buttons reads as a toy.
 */

export type BadgeTone = "neutral" | "brand" | StatusName;

const TONE: Record<BadgeTone, string> = {
  neutral: "bg-surface-sunken-ground text-surface-sunken-ink border-surface-sunken-hairline",
  brand: "bg-brand-subtle-ground text-brand-subtle-ink border-brand-subtle-hairline",
  success:
    "bg-status-success-subtle-ground text-status-success-subtle-ink border-status-success-subtle-hairline",
  warning:
    "bg-status-warning-subtle-ground text-status-warning-subtle-ink border-status-warning-subtle-hairline",
  danger:
    "bg-status-danger-subtle-ground text-status-danger-subtle-ink border-status-danger-subtle-hairline",
  info: "bg-status-info-subtle-ground text-status-info-subtle-ink border-status-info-subtle-hairline",
};

const GLYPH: Record<StatusIconName, ComponentType<{ className?: string }>> = {
  CircleCheck,
  TriangleAlert,
  CircleX,
  Info,
};

function isStatusTone(tone: BadgeTone): tone is StatusName {
  return tone in STATUS_SIGNAL;
}

export interface BadgeProps {
  readonly tone?: BadgeTone;
  readonly children: ReactNode;
  /**
   * Status tones show their token-declared glyph by default. Set false only
   * where the surrounding row already carries the second channel.
   */
  readonly icon?: boolean;
  readonly className?: string;
}

export function Badge({ tone = "neutral", children, icon = true, className }: BadgeProps) {
  const Glyph = icon && isStatusTone(tone) ? GLYPH[STATUS_SIGNAL[tone].icon] : null;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-control border px-2 py-px text-caption font-medium whitespace-nowrap",
        TONE[tone],
        className,
      )}
    >
      {Glyph ? <Glyph className="size-4 shrink-0" /> : null}
      {children}
    </span>
  );
}
