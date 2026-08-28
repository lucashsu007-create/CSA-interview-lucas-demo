import { radius, typeScale } from "@csa/design-tokens";
import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

/**
 * Conditional classes, with later Tailwind utilities beating earlier ones.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS IS CONFIGURED RATHER THAN THE STOCK `twMerge`
 * ---------------------------------------------------------------------------
 * `tailwind-merge` decides which classes conflict from a built-in map of
 * TAILWIND'S DEFAULT theme. This project deliberately REPLACES that theme, so
 * the stock resolver cannot classify our class names — it sees `text-caption`,
 * fails to recognise it as a font size, falls back to reading it as a colour,
 * and therefore treats it as conflicting with `text-brand-solid-ink`. Last one
 * wins, and one of the two silently disappears.
 *
 * That is not hypothetical. It shipped: the primary button rendered
 * near-black-on-red because `cn(VARIANT, SIZE)` put `text-caption` after
 * `text-brand-solid-ink` and the ink was dropped. It type-checked, it built,
 * and it was only visible by looking at the thing.
 *
 * The scale below is read from the tokens, not typed out, so a new type step or
 * radius cannot appear in the design system and be missing here.
 */
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      /* `text-caption`, `text-bodySm`, `text-heading`, … are SIZES. Saying so is
       * what keeps `text-<colour>` from being treated as the same property. */
      "font-size": [{ text: Object.keys(typeScale) }],
      /* `rounded-control` / `rounded-card` / `rounded-pill`. */
      rounded: [{ rounded: Object.keys(radius) }],
    },
  },
});

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
