/**
 * Contract §1: money is integer cents, EUR, never a float. Columns end `_cents`.
 *
 * `Cents` is a documented alias for `number` rather than a branded type: these
 * values cross a package boundary into two runtimes and a branded type would
 * force casts in every parser and test for no extra safety against the actual
 * hazard, which is float arithmetic. The hazard is handled by keeping every
 * arithmetic helper here integral and by validating at the parse boundary.
 */

/** An amount in whole euro cents. Never a fractional value. */
export type Cents = number;

export const ZERO_CENTS: Cents = 0;

export const EUR_SYMBOL = "€";

export function isCents(value: unknown): value is Cents {
  return typeof value === "number" && Number.isSafeInteger(value);
}

export function assertCents(value: unknown, label = "value"): asserts value is Cents {
  if (!isCents(value)) {
    throw new TypeError(`${label} must be an integer number of cents, received ${String(value)}`);
  }
}

/**
 * Converts a euro amount typed by a human (an admin price field) into cents.
 * This is the only place a float is allowed to exist, and it does not survive
 * the call.
 */
export function centsFromEuros(euros: number): Cents {
  if (typeof euros !== "number" || !Number.isFinite(euros)) {
    throw new TypeError(`euros must be a finite number, received ${String(euros)}`);
  }
  return Math.round(euros * 100);
}

/** For display or for pre-filling an edit field only. Never store the result. */
export function centsToEuros(cents: Cents): number {
  assertCents(cents, "cents");
  return cents / 100;
}

export function addCents(...amounts: Cents[]): Cents {
  let total = 0;
  for (const amount of amounts) {
    assertCents(amount, "amount");
    total += amount;
  }
  return total;
}

export interface FormatEurOptions {
  /** `'nl'` renders `€1.234,56` (default). `'en'` renders `€1,234.56`. */
  readonly style?: "nl" | "en";
  /** Include the `€` symbol. Default `true`. */
  readonly symbol?: boolean;
  /** Rendered instead of `€0,00` when the amount is exactly zero, e.g. `'Free'`. */
  readonly zeroLabel?: string;
}

function groupDigits(digits: string, separator: string): string {
  let out = "";
  for (let i = 0; i < digits.length; i += 1) {
    if (i > 0 && (digits.length - i) % 3 === 0) out += separator;
    out += digits.charAt(i);
  }
  return out;
}

/**
 * Renders cents as a euro string.
 *
 * Hand-rolled rather than `Intl.NumberFormat` on purpose: the output must be
 * byte-identical in Node, in Hermes on a device with a trimmed ICU, and in a
 * test assertion. `Intl` gives `nl-NL` a non-breaking space that silently
 * breaks string comparisons.
 */
export function formatEur(cents: Cents, options: FormatEurOptions = {}): string {
  assertCents(cents, "cents");
  const { style = "nl", symbol = true, zeroLabel } = options;
  if (cents === 0 && zeroLabel !== undefined) return zeroLabel;

  const groupSeparator = style === "nl" ? "." : ",";
  const decimalSeparator = style === "nl" ? "," : ".";
  const absolute = Math.abs(cents);
  const whole = groupDigits(String(Math.trunc(absolute / 100)), groupSeparator);
  const fraction = String(absolute % 100).padStart(2, "0");

  return `${cents < 0 ? "-" : ""}${symbol ? EUR_SYMBOL : ""}${whole}${decimalSeparator}${fraction}`;
}
