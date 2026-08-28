import type { EventCategory } from "@csa/domain";

/**
 * Presentation-only formatting. Nothing here decides anything.
 *
 * Rule 6 of the component standard: a component never derives domain truth.
 * These functions turn a value the server already resolved into text — they do
 * not pick a price, judge a membership, or compute capacity.
 */

const EUR = new Intl.NumberFormat("en-IE", {
  style: "currency",
  currency: "EUR",
  minimumFractionDigits: 2,
});

/** Money is integer cents everywhere. This is the only place it becomes a string. */
export function formatCents(cents: number): string {
  return EUR.format(cents / 100);
}

/** Free is a different fact from "€0.00" and reads faster in a price column. */
export function formatPrice(cents: number): string {
  return cents === 0 ? "Free" : formatCents(cents);
}

const DATE_TIME = new Intl.DateTimeFormat("en-GB", {
  weekday: "short",
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

const DATE_ONLY = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

export function formatDateTime(value: Date): string {
  return DATE_TIME.format(value);
}

export function formatDate(value: Date): string {
  return DATE_ONLY.format(value);
}

/**
 * "in 5 days" / "2 hours ago". Uses the browser-and-Node-shared Intl API so the
 * server render and the client agree; nothing here reads a live clock on its
 * own, the instant to judge against is always passed in.
 */
const RELATIVE = new Intl.RelativeTimeFormat("en-GB", { numeric: "auto" });

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export function formatRelative(value: Date, now: Date): string {
  const delta = value.getTime() - now.getTime();
  const abs = Math.abs(delta);

  if (abs < HOUR) return RELATIVE.format(Math.round(delta / MINUTE), "minute");
  if (abs < DAY) return RELATIVE.format(Math.round(delta / HOUR), "hour");
  if (abs < 30 * DAY) return RELATIVE.format(Math.round(delta / DAY), "day");
  return RELATIVE.format(Math.round(delta / (30 * DAY)), "month");
}

/**
 * Percentages are rendered from two counts that both came from the database.
 * Returns null rather than 0 when there is nothing to divide by — a screen that
 * prints "0%" for "no capacity recorded" has invented a measurement.
 */
export function percentOf(part: number, whole: number): number | null {
  if (!Number.isFinite(part) || !Number.isFinite(whole) || whole <= 0) return null;
  return Math.round((part / whole) * 100);
}

/**
 * `event_category` is a CLOSED enum (contract §3). Rendering the raw value puts
 * `educational` in front of a reader; this is the only place it becomes a word,
 * and the compiler asks for a label when the enum grows.
 */
export const EVENT_CATEGORY_LABEL: Record<EventCategory, string> = {
  social: "Social",
  cultural: "Cultural",
  career: "Career",
  educational: "Educational",
  sports: "Sports",
};
