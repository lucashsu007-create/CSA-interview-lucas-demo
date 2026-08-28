/**
 * The HTTP client for the routes in docs/architecture.md section 13.
 *
 * The member app never touches PostgreSQL. `packages/api-client` is a
 * server-only package — it pulls in the `postgres` driver — so this app talks to
 * the Next.js committee portal, which owns the connection, and sends its session
 * as `Authorization: Bearer`.
 *
 * Two decisions worth stating, because both are load-bearing.
 *
 * 1. WIRE KEYS ARE NORMALISED ONCE. The contract says PostgreSQL is snake_case
 *    and TypeScript is camelCase, with the mapping mechanical. The portal serves
 *    domain objects, so it should already be camelCase — but this app is being
 *    written in parallel with those routes and a single leaked `starts_at` would
 *    render as an empty date rather than an error. `camelizeDeep` converts once
 *    at the boundary, so the screens below only ever see one shape. It is
 *    tolerance at the parse edge, not two shapes flowing through the app.
 *
 * 2. NOTHING IS INVENTED. Counts the API does not send stay `null` and the UI
 *    says so in words. A missing `spotsRemaining` rendered as `0` would be an
 *    unmeasured value dressed as a fact, which is precisely what the standard
 *    forbids and precisely the question you do not want asked in a demo.
 *
 * When `packages/api-client` publishes `EventListItem` and friends, the local
 * interfaces here should be replaced by imports of those types. They are written
 * to match contract section 12 field for field.
 */
import type {
  Cents,
  EventCategory,
  EventStatus,
  MembershipStatus,
  MembershipType,
  PaymentStatus,
  RegistrationErrorCode,
  UserRole,
  Uuid,
} from "@csa/domain";
import { isRegistrationErrorCode } from "@csa/domain";

import { API_BASE_URL } from "./config";

/* ========================================================================== *
 * Types — contract section 12, as they arrive over the wire
 * ========================================================================== */

export interface EventListItem {
  readonly id: Uuid;
  readonly title: string;
  readonly description: string;
  readonly category: EventCategory;
  readonly location: string;
  readonly startsAt: Date;
  readonly registrationDeadlineAt: Date;
  readonly capacity: number;
  readonly priceMemberCents: Cents;
  readonly pricePublicCents: Cents;
  readonly status: EventStatus;
  readonly imageUrl: string | null;
  /** Null when the API did not send it. Never defaulted to zero. */
  readonly registeredCount: number | null;
  /** Null when the API did not send it. Never derived from capacity here. */
  readonly spotsRemaining: number | null;
}

export type EventDetail = EventListItem;

export interface ActiveMembership {
  readonly memberNumber: string;
  readonly membershipType: MembershipType;
  readonly status: MembershipStatus;
  readonly startsAt: Date;
  readonly expiresAt: Date;
}

/** `GET /api/me` — identity, role, active membership. */
export interface Me {
  readonly id: Uuid;
  readonly email: string;
  readonly fullName: string;
  readonly role: UserRole;
  /** Null when the user holds no active membership. Public pricing applies. */
  readonly activeMembership: ActiveMembership | null;
}

/** `POST /api/events/:id/register` on success. */
export interface RegistrationSummary {
  readonly id: Uuid;
  readonly eventId: Uuid;
  readonly ticketCode: string;
  readonly pricePaidCents: Cents;
  readonly isMemberPrice: boolean;
  readonly paymentStatus: PaymentStatus;
}

/* ========================================================================== *
 * Errors
 * ========================================================================== */

/**
 * Every failure the screens handle.
 *
 * `code` is the contract's own token — the portal sends `{ error: "event_full" }`
 * specifically so a client switches on it instead of parsing prose. `network`
 * and `unconfigured` are this client's own additions for the two failures that
 * happen before a response exists.
 */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(message: string, options: { status: number; code: string }) {
    super(message);
    this.name = "ApiError";
    this.status = options.status;
    this.code = options.code;
  }

  get registrationCode(): RegistrationErrorCode | null {
    return isRegistrationErrorCode(this.code) ? this.code : null;
  }
}

/* ========================================================================== *
 * Wire normalisation
 * ========================================================================== */

function camelize(key: string): string {
  return key.replace(/_([a-z0-9])/g, (_match, character: string) => character.toUpperCase());
}

function camelizeDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(camelizeDeep);
  if (value === null || typeof value !== "object") return value;
  const out: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    out[camelize(key)] = camelizeDeep(item);
  }
  return out;
}

type Row = Record<string, unknown>;

function asRow(value: unknown): Row {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new ApiError("The server sent something this app cannot read.", {
      status: 0,
      code: "malformed_response",
    });
  }
  return value as Row;
}

function str(row: Row, key: string): string {
  const value = row[key];
  return typeof value === "string" ? value : "";
}

function strOrNull(row: Row, key: string): string | null {
  const value = row[key];
  return typeof value === "string" && value.length > 0 ? value : null;
}

function num(row: Row, key: string, fallback: number): number {
  const value = row[key];
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

/** Null rather than zero when the field is absent — see the note at the top. */
function numOrNull(row: Row, key: string): number | null {
  const value = row[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/**
 * Timestamps cross the wire as ISO strings; domain objects hold `Date`. The
 * conversion happens exactly here and nowhere else. An unparseable value becomes
 * the epoch rather than an `Invalid Date`, so a formatter can never render
 * `NaN` into a screen.
 */
function date(row: Row, key: string): Date {
  const value = row[key];
  if (typeof value === "string" || typeof value === "number") {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  return new Date(0);
}

function parseEvent(raw: unknown): EventListItem {
  const row = asRow(raw);
  return {
    id: str(row, "id"),
    title: str(row, "title"),
    description: str(row, "description"),
    category: str(row, "category") as EventCategory,
    location: str(row, "location"),
    startsAt: date(row, "startsAt"),
    registrationDeadlineAt: date(row, "registrationDeadlineAt"),
    capacity: num(row, "capacity", 0),
    priceMemberCents: num(row, "priceMemberCents", 0),
    pricePublicCents: num(row, "pricePublicCents", 0),
    status: str(row, "status") as EventStatus,
    imageUrl: strOrNull(row, "imageUrl"),
    registeredCount: numOrNull(row, "registeredCount"),
    spotsRemaining: numOrNull(row, "spotsRemaining"),
  };
}

function parseMe(raw: unknown): Me {
  const row = asRow(raw);
  const membershipRaw = row["activeMembership"];
  const membership =
    membershipRaw && typeof membershipRaw === "object" ? asRow(membershipRaw) : null;

  return {
    id: str(row, "id"),
    email: str(row, "email"),
    fullName: str(row, "fullName"),
    role: (str(row, "role") || "attendee") as UserRole,
    activeMembership: membership
      ? {
          memberNumber: str(membership, "memberNumber"),
          membershipType: str(membership, "membershipType") as MembershipType,
          status: str(membership, "status") as MembershipStatus,
          startsAt: date(membership, "startsAt"),
          expiresAt: date(membership, "expiresAt"),
        }
      : null,
  };
}

function parseRegistration(raw: unknown): RegistrationSummary {
  const row = asRow(raw);
  return {
    id: str(row, "id"),
    eventId: str(row, "eventId"),
    ticketCode: str(row, "ticketCode"),
    pricePaidCents: num(row, "pricePaidCents", 0),
    isMemberPrice: row["isMemberPrice"] === true,
    paymentStatus: (str(row, "paymentStatus") || "pending") as PaymentStatus,
  };
}

/* ========================================================================== *
 * Transport
 * ========================================================================== */

const REQUEST_TIMEOUT_MS = 12_000;

interface RequestOptions {
  readonly method?: "GET" | "POST" | "DELETE";
  readonly token?: string | null;
  readonly body?: unknown;
  readonly signal?: AbortSignal;
}

async function request(path: string, options: RequestOptions = {}): Promise<unknown> {
  if (!API_BASE_URL) {
    throw new ApiError(
      "No API address is configured. Set EXPO_PUBLIC_API_BASE_URL to the committee portal.",
      { status: 0, code: "unconfigured" },
    );
  }

  const { method = "GET", token = null, body, signal } = options;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const onOuterAbort = () => controller.abort();
  signal?.addEventListener("abort", onOuterAbort);

  const headers: Record<string, string> = { Accept: "application/json" };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (token) headers["Authorization"] = `Bearer ${token}`;

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
  } catch {
    throw new ApiError(`Could not reach the committee portal at ${API_BASE_URL}.`, {
      status: 0,
      code: "network",
    });
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener("abort", onOuterAbort);
  }

  const text = await response.text();
  const payload: unknown = text.length > 0 ? safeJsonParse(text) : null;
  const normalised = camelizeDeep(payload);

  if (!response.ok) {
    const errorRow =
      normalised && typeof normalised === "object" ? (normalised as Row) : ({} as Row);
    const code = strOrNull(errorRow, "error") ?? `http_${response.status}`;
    const message = strOrNull(errorRow, "message") ?? messageForStatus(response.status);
    throw new ApiError(message, { status: response.status, code });
  }

  return normalised;
}

function safeJsonParse(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ApiError("The server sent something this app cannot read.", {
      status: 0,
      code: "malformed_response",
    });
  }
}

function messageForStatus(status: number): string {
  if (status === 401) return "That session is no longer valid.";
  if (status === 403) return "This identity is not allowed to do that.";
  if (status === 404) return "That is not here.";
  if (status >= 500) return "The committee portal had a problem.";
  return `The request failed (HTTP ${status}).`;
}

/* ========================================================================== *
 * Routes — contract section 13
 * ========================================================================== */

/** `POST /api/session`. Returns the bearer token for the chosen demo identity. */
export async function createSession(email: string, signal?: AbortSignal): Promise<string> {
  const payload = asRow(await request("/api/session", { method: "POST", body: { email }, signal }));
  const token = strOrNull(payload, "token");
  if (!token) {
    throw new ApiError("The portal did not return a session token.", {
      status: 0,
      code: "malformed_response",
    });
  }
  return token;
}

/** `DELETE /api/session`. */
export async function deleteSession(token: string | null): Promise<void> {
  await request("/api/session", { method: "DELETE", token });
}

/**
 * `GET /api/events`, optionally filtered by category.
 *
 * Accepts either a bare array or `{ events: [...] }`; the contract names the
 * route, not the envelope.
 */
export async function listEvents(
  options: { token?: string | null; category?: EventCategory | null; signal?: AbortSignal } = {},
): Promise<EventListItem[]> {
  const query = options.category ? `?category=${encodeURIComponent(options.category)}` : "";
  const payload = await request(`/api/events${query}`, {
    token: options.token ?? null,
    signal: options.signal,
  });
  const rows = Array.isArray(payload)
    ? payload
    : Array.isArray((payload as Row | null)?.["events"])
      ? ((payload as Row)["events"] as unknown[])
      : [];
  return rows.map(parseEvent);
}

/** `GET /api/events/:id`. */
export async function getEvent(
  eventId: string,
  options: { token?: string | null; signal?: AbortSignal } = {},
): Promise<EventDetail> {
  const payload = await request(`/api/events/${encodeURIComponent(eventId)}`, {
    token: options.token ?? null,
    signal: options.signal,
  });
  const row = asRow(payload);
  const inner = row["event"];
  return parseEvent(inner && typeof inner === "object" ? inner : row);
}

/** `GET /api/me`. */
export async function getMe(token: string, signal?: AbortSignal): Promise<Me> {
  const payload = asRow(await request("/api/me", { token, signal }));
  const inner = payload["user"];
  return parseMe(inner && typeof inner === "object" ? { ...(inner as Row), ...payload } : payload);
}

/** `POST /api/events/:id/register`. Errors arrive as contract tokens on `ApiError.code`. */
export async function registerForEvent(
  eventId: string,
  token: string,
): Promise<RegistrationSummary> {
  const payload = await request(`/api/events/${encodeURIComponent(eventId)}/register`, {
    method: "POST",
    token,
  });
  const row = asRow(payload);
  const inner = row["registration"];
  return parseRegistration(inner && typeof inner === "object" ? inner : row);
}
