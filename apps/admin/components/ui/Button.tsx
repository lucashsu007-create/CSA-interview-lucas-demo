import type { ButtonHTMLAttributes } from "react";

import { cn } from "@/lib/cn";

/**
 * The one button shell in the portal.
 *
 * If you are writing padding and a radius onto a raw <button>, you are
 * re-implementing this. A link-shaped CTA calls `buttonClassName()` and puts
 * the result on the <a> — that is the supported way to make a link look like a
 * button, and it is why the class builder is exported separately.
 *
 * Notes on the state set, since none of it is arbitrary:
 *
 *  - FOCUS is absent from every variant. It comes from the single global
 *    `:focus-visible` rule in `globals.css`. `focus-ground-brand` on the solid
 *    variants does not add a ring — it re-points the existing one, because a
 *    brand-red ring is invisible on a brand-red button.
 *  - HOVER on a solid ground is the `pressed` opacity token. The token package
 *    ships no hover ground, and inventing one (or borrowing `status.danger`'s
 *    deeper red for brand chrome) would put a value in a component.
 *  - ACTIVE is a 1px transform. Transform and opacity only.
 *  - DISABLED is reduced opacity PLUS non-interactivity, never a colour change.
 */

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

const VARIANT: Record<ButtonVariant, string> = {
  primary:
    "focus-ground-brand bg-brand-solid-ground text-brand-solid-ink hover:opacity-pressed border border-brand-solid-ground",
  secondary:
    "bg-surface-card-ground text-surface-card-ink border border-surface-card-outline hover:bg-surface-sunken-ground",
  ghost:
    "bg-transparent text-surface-app-ink border border-transparent hover:bg-surface-sunken-ground",
  danger:
    "focus-ground-danger bg-status-danger-solid-ground text-status-danger-solid-ink hover:opacity-pressed border border-status-danger-solid-ground",
};

const SIZE: Record<ButtonSize, string> = {
  /* Below the 48px touch floor on purpose: the committee register is
   * pointer-driven and dense. This size must never appear in apps/mobile. */
  sm: "min-h-control-sm gap-1 px-3 text-caption",
  md: "min-h-control-md gap-2 px-4 text-bodySm",
  lg: "min-h-control-lg gap-2 px-6 text-body",
};

const BASE =
  "inline-flex items-center justify-center rounded-control font-semibold whitespace-nowrap " +
  "transition-[opacity,transform,background-color] duration-fast ease-standard " +
  "active:translate-y-px " +
  "disabled:pointer-events-none disabled:opacity-disabled " +
  "aria-disabled:pointer-events-none aria-disabled:opacity-disabled";

export interface ButtonClassOptions {
  readonly variant?: ButtonVariant;
  readonly size?: ButtonSize;
  readonly fullWidth?: boolean;
  readonly className?: string;
}

/** For anchors and any element that must look like a button but not be one. */
export function buttonClassName({
  variant = "secondary",
  size = "md",
  fullWidth = false,
  className,
}: ButtonClassOptions = {}): string {
  return cn(BASE, VARIANT[variant], SIZE[size], fullWidth && "w-full", className);
}

/**
 * The DOM props plus the variant knobs. Intersected rather than extended
 * because `ButtonClassOptions.className` is `readonly` and React's is not, and
 * two declarations of one property have to agree exactly.
 */
export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  readonly variant?: ButtonVariant;
  readonly size?: ButtonSize;
  readonly fullWidth?: boolean;
};

export function Button({
  variant,
  size,
  fullWidth,
  className,
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={buttonClassName({ variant, size, fullWidth, className })}
      {...props}
    />
  );
}
