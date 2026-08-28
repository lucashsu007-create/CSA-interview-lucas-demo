/**
 * Shared scalar vocabulary.
 *
 * Contract §1: PostgreSQL is snake_case, TypeScript is camelCase, the mapping is
 * mechanical. Primary keys are uuid. Timestamps are timestamptz, always UTC.
 */

/** A PostgreSQL `uuid` primary or foreign key. */
export type Uuid = string;

/**
 * An ISO-8601 timestamp string — the wire form of a `timestamptz` column.
 * Domain objects hold `Date`; only raw rows and JSON payloads hold this.
 */
export type IsoDateTime = string;

/**
 * Deliberately lenient: seeds commonly use readable literals such as
 * `00000000-0000-0000-0000-000000000001`, which a version/variant-strict RFC
 * 4122 pattern would reject.
 */
export const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is Uuid {
  return typeof value === "string" && UUID_REGEX.test(value);
}

/** Any value representable in a `jsonb` column. */
export type Json = string | number | boolean | null | Json[] | { [key: string]: Json };

/** The object form of {@link Json}, which is what `metadata` and `properties` hold. */
export type JsonObject = { [key: string]: Json };

export function isJson(value: unknown): value is Json {
  if (value === null) return true;
  const kind = typeof value;
  if (kind === "string" || kind === "boolean") return true;
  if (kind === "number") return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(isJson);
  if (kind === "object") return Object.values(value as Record<string, unknown>).every(isJson);
  return false;
}

export function isJsonObject(value: unknown): value is JsonObject {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Object.values(value as Record<string, unknown>).every(isJson)
  );
}
