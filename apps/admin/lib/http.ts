import { CSA_ERROR_TOKENS, isCsaError, isCsaErrorToken, type CsaErrorToken } from "@csa/api-client";
import { NextResponse } from "next/server";

/**
 * Contract §13's error discipline in one place.
 *
 * "The token travels in the body as `{ error: "event_full" }` so clients switch
 * on it rather than parsing prose." That is the whole reason this module exists:
 * the Expo app branches on a stable string, and a route that returned a sentence
 * would force it to pattern-match English.
 *
 * The TOKENS are the data layer's — `CSA_ERROR_TOKENS` and `CsaError` come from
 * `@csa/api-client`, which is where the SQLSTATE-to-token mapping lives. What
 * belongs to this layer, and only this layer, is which HTTP status each token
 * leaves as. Duplicating the token list here would give the system two lists
 * that drift.
 */

/**
 * Contract §13, exactly: `event_full` → 409, `registration_closed` → 409,
 * `event_not_published` → 404, `already_registered` → 409, `forbidden` → 403.
 *
 * The remaining class-`CSA` tokens are mapped too, because the database can
 * raise them and a client that receives an unexplained 500 for
 * `invalid_arguments` learns nothing it can act on.
 */
const STATUS: Record<CsaErrorToken, number> = {
  invalid_arguments: 400,
  event_not_published: 404,
  registration_closed: 409,
  event_full: 409,
  event_not_found: 404,
  already_registered: 409,
  ticket_code_exhausted: 500,
  user_not_found: 404,
  forbidden: 403,
};

/** Tokens this layer raises itself, which the database has no opinion about. */
export type PortalErrorToken = CsaErrorToken | "unauthenticated" | "invalid_body" | "unavailable";

const PORTAL_STATUS: Record<string, number> = {
  ...STATUS,
  unauthenticated: 401,
  invalid_body: 400,
  unavailable: 503,
};

/**
 * Finds the raised token wherever it ended up.
 *
 * `CsaError` is the normal path — the data layer already read the SQLSTATE and
 * the message. The string search is the fallback for an error that crossed a
 * boundary and lost its class: contract §5 puts the token in the exception
 * MESSAGE (because `event_full` is not a valid five-character SQLSTATE), so it
 * is still recoverable from the text.
 */
export function csaErrorToken(error: unknown): CsaErrorToken | null {
  if (isCsaError(error)) {
    return isCsaErrorToken(error.code) ? error.code : null;
  }

  const haystack =
    typeof error === "string"
      ? error
      : typeof error === "object" && error !== null
        ? ["code", "message", "detail", "details", "hint"]
            .map((key) => (error as Record<string, unknown>)[key])
            .filter((part): part is string => typeof part === "string")
            .join(" ")
        : "";

  return CSA_ERROR_TOKENS.find((token) => haystack.includes(token)) ?? null;
}

export function jsonOk<T>(body: T, status = 200): NextResponse {
  return NextResponse.json(body, { status });
}

/** `{ error: "<token>" }` and nothing else. Prose belongs in the UI, not the wire. */
export function jsonError(token: PortalErrorToken, status?: number): NextResponse {
  return NextResponse.json({ error: token }, { status: status ?? PORTAL_STATUS[token] ?? 500 });
}

/**
 * The one place a thrown database error becomes a response.
 *
 * An unrecognised failure is a 503 carrying `unavailable`, not a 500 carrying a
 * stack: the message can include a query fragment, and this API is consumed by
 * a mobile client that has no business receiving one. The detail is logged
 * server-side instead.
 */
export function jsonFromError(error: unknown, context: string): NextResponse {
  const token = csaErrorToken(error);
  if (token !== null) return jsonError(token);

  console.error(`[csa/admin] ${context} failed`, error);
  return jsonError("unavailable");
}
