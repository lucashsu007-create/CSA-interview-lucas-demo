/**
 * WCAG 2.1 contrast maths.
 *
 * Written out longhand on purpose: this package has zero runtime dependencies,
 * and a contrast check is the one thing in the design system that must never
 * be taken on trust from a transitive dependency.
 *
 * Reference: WCAG 2.1 SC 1.4.3 (Contrast Minimum), SC 1.4.11 (Non-text Contrast).
 */

export type Hex = `#${string}`;

export interface Rgb {
  readonly r: number;
  readonly g: number;
  readonly b: number;
}

/** Parses `#rgb` or `#rrggbb`. Throws on anything else — a bad token is a bug, not a fallback. */
export function hexToRgb(hex: Hex | string): Rgb {
  const raw = hex.trim().replace(/^#/, "");
  const full =
    raw.length === 3
      ? raw
          .split("")
          .map((c) => c + c)
          .join("")
      : raw;

  if (!/^[0-9a-fA-F]{6}$/.test(full)) {
    throw new Error(`Not a hex colour: ${String(hex)}`);
  }

  return {
    r: Number.parseInt(full.slice(0, 2), 16),
    g: Number.parseInt(full.slice(2, 4), 16),
    b: Number.parseInt(full.slice(4, 6), 16),
  };
}

export function rgbToHex({ r, g, b }: Rgb): Hex {
  const part = (n: number) =>
    Math.max(0, Math.min(255, Math.round(n)))
      .toString(16)
      .padStart(2, "0")
      .toUpperCase();
  return `#${part(r)}${part(g)}${part(b)}`;
}

/** `rgba()` string from a hex plus an alpha. Used by both bridges for shadows and scrims. */
export function hexToRgba(hex: Hex | string, alpha: number): string {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/** sRGB 8-bit channel -> linear-light value. WCAG 2.1 relative luminance definition. */
function linearize(channel8Bit: number): number {
  const c = channel8Bit / 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

/** WCAG relative luminance, 0 (black) to 1 (white). */
export function relativeLuminance(hex: Hex | string): number {
  const { r, g, b } = hexToRgb(hex);
  return 0.2126 * linearize(r) + 0.7152 * linearize(g) + 0.0722 * linearize(b);
}

/**
 * WCAG contrast ratio, 1 (identical) to 21 (black on white).
 * Symmetric: the order of the two colours does not matter.
 */
export function contrastRatio(a: Hex | string, b: Hex | string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const lighter = Math.max(la, lb);
  const darker = Math.min(la, lb);
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * The three thresholds this project holds itself to.
 *
 * - `text`      4.5:1  — body-size text (SC 1.4.3 AA)
 * - `largeText` 3.0:1  — text at >= 24px, or >= 18.66px at weight >= 700 (SC 1.4.3 AA)
 * - `ui`        3.0:1  — control boundaries, focus indicators, meaningful graphics (SC 1.4.11)
 */
export type ContrastRole = "text" | "largeText" | "ui";

export const CONTRAST_MINIMUM: Readonly<Record<ContrastRole, number>> = {
  text: 4.5,
  largeText: 3,
  ui: 3,
};

/** WCAG's "large scale text" boundary, in CSS px / density-independent points. */
export const LARGE_TEXT_MIN_PX = 24;
export const LARGE_TEXT_BOLD_MIN_PX = 18.66;
export const BOLD_WEIGHT_MIN = 700;

/** Is this size/weight combination "large scale text" under WCAG? */
export function isLargeText(sizePx: number, weight: number): boolean {
  if (sizePx >= LARGE_TEXT_MIN_PX) return true;
  return weight >= BOLD_WEIGHT_MIN && sizePx >= LARGE_TEXT_BOLD_MIN_PX;
}

/** The threshold a given piece of text must clear, derived from its own type token. */
export function requiredRatioForText(sizePx: number, weight: number): number {
  return isLargeText(sizePx, weight) ? CONTRAST_MINIMUM.largeText : CONTRAST_MINIMUM.text;
}

export function meetsContrast(a: Hex | string, b: Hex | string, role: ContrastRole): boolean {
  return contrastRatio(a, b) >= CONTRAST_MINIMUM[role];
}

/** Ratio rounded to two decimals — for readable assertion messages and dev tooling. */
export function formatRatio(a: Hex | string, b: Hex | string): string {
  return `${contrastRatio(a, b).toFixed(2)}:1`;
}
