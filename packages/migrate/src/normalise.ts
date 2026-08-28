/**
 * Conservative transforms.
 *
 * Every function here returns either a value and the rule that produced it, or
 * a refusal with a machine-readable reason. None of them guesses. A transform
 * that quarantines more is cheaper than a clever one that guesses wrong, and
 * the expensive direction is not recoverable: a wrongly "corrected" email is
 * indistinguishable from a correct one once it is in the target.
 */
import type { QuarantineReason } from "@csa/domain";

import { RULES } from "./rules";
import type { RuleName } from "./rules";

export interface Kept<T> {
  readonly ok: true;
  readonly value: T;
  readonly rules: readonly RuleName[];
}

export interface Refused {
  readonly ok: false;
  readonly reason: QuarantineReason;
  readonly detail: string;
}

export type Outcome<T> = Kept<T> | Refused;

const keep = <T>(value: T, ...rules: RuleName[]): Kept<T> => ({ ok: true, value, rules });
const refuse = (reason: QuarantineReason, detail: string): Refused => ({
  ok: false,
  reason,
  detail,
});

/**
 * Trim, unwrap a display name, lowercase. Nothing else.
 *
 * A legacy record stores `Wen Veldkamp <WEN@…>`, `  wen@… `, and `wen @ …`.
 * All three are the same address and all three normalise. A domain that looks
 * like a typo is left exactly as it is — see REFUSED_RULES.
 */
export function normaliseEmail(raw: string | undefined | null): Outcome<string> {
  const input = (raw ?? "").trim();
  if (input === "") {
    return refuse("missing_required_field", "no email address on the source record");
  }

  const angled = /<([^>]*)>/.exec(input);
  const bare = (angled?.[1] ?? input).replace(/\s+/g, "").toLowerCase();

  const at = bare.indexOf("@");
  if (at <= 0 || at !== bare.lastIndexOf("@") || at === bare.length - 1) {
    return refuse("missing_required_field", `not an email address: ${JSON.stringify(input)}`);
  }
  const domain = bare.slice(at + 1);
  if (!domain.includes(".") || domain.startsWith(".") || domain.endsWith(".")) {
    return refuse("missing_required_field", `email has no usable domain: ${JSON.stringify(input)}`);
  }

  return keep(bare, RULES.EMAIL_NORMALISED);
}

/** True for a real calendar date, so 31 February is rejected rather than rolled. */
function realDate(year: number, month: number, day: number): boolean {
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;
  const d = new Date(Date.UTC(year, month - 1, day));
  return d.getUTCFullYear() === year && d.getUTCMonth() === month - 1 && d.getUTCDate() === day;
}

/**
 * Reads the two formats the estate actually contains: ISO-8601, and the
 * `dd-mm-yyyy` the older records were typed in.
 *
 * `new Date("31-02-2024")` and its friends will happily roll February 31st into
 * March 2nd. That silent correction is the failure this exists to prevent, so
 * the components are checked before a Date is constructed at all.
 */
export function parseLegacyDate(raw: string | undefined | null): Outcome<Date> {
  const input = (raw ?? "").trim();
  if (input === "") return refuse("missing_required_field", "no date on the source record");

  const isoMatch = /^(\d{4})-(\d{2})-(\d{2})(?:[T ].*)?$/.exec(input);
  if (isoMatch) {
    const [, y, m, d] = isoMatch as unknown as [string, string, string, string];
    const year = Number(y);
    const month = Number(m);
    const day = Number(d);
    if (!realDate(year, month, day)) {
      return refuse("unparseable_date", `not a date on any calendar: ${JSON.stringify(input)}`);
    }
    return keep(new Date(Date.UTC(year, month - 1, day)), RULES.DATE_ISO_PARSED);
  }

  const dutchMatch = /^(\d{1,2})-(\d{1,2})-(\d{4})$/.exec(input);
  if (dutchMatch) {
    const [, d, m, y] = dutchMatch as unknown as [string, string, string, string];
    const year = Number(y);
    const month = Number(m);
    const day = Number(d);
    if (!realDate(year, month, day)) {
      return refuse("unparseable_date", `not a date on any calendar: ${JSON.stringify(input)}`);
    }
    return keep(new Date(Date.UTC(year, month - 1, day)), RULES.DATE_DUTCH_PARSED);
  }

  // "onbekend" — someone typed that they did not know. That is information, and
  // it is not a date.
  return refuse("unparseable_date", `unrecognised date format: ${JSON.stringify(input)}`);
}

/**
 * Money to integer cents, EUR (contract §1).
 *
 * Handles `€ 15,00`, `15.00`, `15,00` and `15`. A value with both separators is
 * refused rather than resolved: `1.234,56` and `1,234.56` are the same digits
 * under two conventions, and picking one is a guess about six figures.
 */
export function parseMoneyToCents(raw: string | undefined | null): Outcome<number> {
  const input = (raw ?? "").trim();
  if (input === "") return refuse("missing_required_field", "no amount on the source record");

  const digits = input.replace(/[€\s]/g, "");
  if (!/^-?[\d.,]+$/.test(digits)) {
    return refuse("missing_required_field", `not an amount: ${JSON.stringify(input)}`);
  }
  if (digits.includes(".") && digits.includes(",")) {
    return refuse(
      "missing_required_field",
      `ambiguous thousands separator, refusing to guess: ${JSON.stringify(input)}`,
    );
  }

  const decimal = digits.replace(",", ".");
  const value = Number(decimal);
  if (!Number.isFinite(value)) {
    return refuse("missing_required_field", `not an amount: ${JSON.stringify(input)}`);
  }
  // Cents via rounding on a scaled integer: 15.10 * 100 is 1509.9999… in binary
  // floating point, and truncation would quietly lose a cent per row.
  const cents = Math.round(value * 100);
  if (cents < 0)
    return refuse("missing_required_field", `negative amount: ${JSON.stringify(input)}`);
  return keep(cents, RULES.MONEY_PARSED);
}

export interface NormalisedPhone {
  readonly value: string;
  readonly e164: boolean;
}

/**
 * E.164 only when the country is certain — which means the number already
 * carries a `+`, or the source told us the country.
 *
 * A bare `612345678` is a Dutch mobile and also a valid subscriber number in
 * other plans. Prefixing `+31` because the association is Dutch is a guess
 * about how to reach a person, so the number is kept exactly as found and the
 * record is flagged.
 */
export function normalisePhone(
  raw: string | undefined | null,
  country: string | undefined | null,
): Outcome<NormalisedPhone> {
  const input = (raw ?? "").replace(/[\s()-]/g, "");
  if (input === "") return refuse("missing_required_field", "no phone number");

  if (input.startsWith("+")) {
    if (!/^\+\d{6,15}$/.test(input)) {
      return refuse("unresolvable_country", `not a usable international number: ${input}`);
    }
    return keep({ value: input, e164: true }, RULES.PHONE_E164);
  }

  if ((country ?? "").trim().toUpperCase() === "NL" && /^0?6\d{8}$/.test(input)) {
    return keep({ value: `+31${input.replace(/^0/, "")}`, e164: true }, RULES.PHONE_E164);
  }

  if ((country ?? "").trim() === "") {
    return refuse(
      "unresolvable_country",
      `national number with no country; E.164 would require a guess: ${input}`,
    );
  }

  return keep({ value: input, e164: false }, RULES.PHONE_LEFT_UNNORMALISED);
}
