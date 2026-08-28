/**
 * Display formatting.
 *
 * Hand-rolled rather than `Intl.DateTimeFormat`, for the same reason
 * `@csa/domain`'s `formatEur` is hand-rolled: the output has to be identical in
 * Node, in Hermes on a device whose ICU may be trimmed, and in a web preview.
 * `Intl` is not dependable across all three, and a date that renders one way in
 * review and another on the demo device is exactly the kind of surprise this
 * project cannot afford.
 *
 * English only. Localisation is not in this wave and pretending otherwise with
 * a locale argument nothing passes would be furniture.
 */

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

const WEEKDAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

/** `Sat 6 September` — the list-row form, where the year is usually noise. */
export function formatDayAndMonth(date: Date): string {
  const weekday = WEEKDAYS[date.getDay()] ?? "";
  const month = MONTHS[date.getMonth()] ?? "";
  return `${weekday.slice(0, 3)} ${date.getDate()} ${month}`;
}

/** `20:00` — 24-hour, which is what the Netherlands reads. */
export function formatTime(date: Date): string {
  return `${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
}

/** `Saturday 6 September 2026, 20:00` — the detail-screen form. */
export function formatDateTimeLong(date: Date): string {
  const weekday = WEEKDAYS[date.getDay()] ?? "";
  const month = MONTHS[date.getMonth()] ?? "";
  return `${weekday} ${date.getDate()} ${month} ${date.getFullYear()}, ${formatTime(date)}`;
}

/** `6 Sep 2026, 20:00` — compact, for deadlines and metadata rows. */
export function formatDateTimeShort(date: Date): string {
  const month = (MONTHS[date.getMonth()] ?? "").slice(0, 3);
  return `${date.getDate()} ${month} ${date.getFullYear()}, ${formatTime(date)}`;
}

/**
 * `in 3 days` / `2 hours ago`.
 *
 * Returns null rather than "0 minutes" when the two instants are within a
 * minute of each other; the caller shows the absolute time instead. An
 * unmeasurable interval is not zero.
 */
export function formatRelative(target: Date, now: Date): string | null {
  const deltaMs = target.getTime() - now.getTime();
  const future = deltaMs >= 0;
  const absMinutes = Math.floor(Math.abs(deltaMs) / 60_000);
  if (absMinutes < 1) return null;

  const units: readonly [number, string][] = [
    [60 * 24, "day"],
    [60, "hour"],
    [1, "minute"],
  ];
  for (const [minutesPer, name] of units) {
    const count = Math.floor(absMinutes / minutesPer);
    if (count >= 1) {
      const plural = count === 1 ? name : `${name}s`;
      return future ? `in ${count} ${plural}` : `${count} ${plural} ago`;
    }
  }
  return null;
}

const CATEGORY_LABELS = {
  social: "Social",
  cultural: "Cultural",
  career: "Career",
  educational: "Educational",
  sports: "Sports",
} as const;

export function categoryLabel(category: keyof typeof CATEGORY_LABELS): string {
  return CATEGORY_LABELS[category];
}
