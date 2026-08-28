import type { Uuid } from "@csa/domain";
import { cookies } from "next/headers";
import type { NextRequest } from "next/server";

import { verifySession } from "@csa/api-client";

/**
 * Contract §11 — sessions without GoTrue.
 *
 * Neither Docker nor the Supabase CLI is available here, so there is no local
 * GoTrue to issue tokens. Picking a demo identity mints an HS256 JWT whose
 * `sub` is `public.users.id`; every database call then opens a transaction and
 * issues `set local request.jwt.claims` before any statement, which is exactly
 * the GUC Supabase itself sets. Moving to a real Supabase project later
 * replaces the token issuer and changes no SQL.
 *
 * The token is httpOnly so no script can read it, and the signing/verifying
 * lives in `@csa/api-client` — this module only decides where the token is
 * carried and never inspects its contents itself.
 */

export const SESSION_COOKIE = "csa_session";

/**
 * Set once per browser session by the auto-login route, whether or not it
 * managed to mint a session.
 *
 * It is what stops `proxy.ts` bouncing a request back to the auto-login route
 * forever when auto-login is off, misconfigured, or the identity is absent from
 * the seed. It is deliberately session-scoped rather than given a lifetime:
 * signing out then stays signed out for the rest of the browser session instead
 * of being undone by the next navigation, and a fresh browser session opens
 * signed in again.
 *
 * `proxy.ts` repeats this name as a literal because matcher values must be
 * statically analysable. Changing it here means changing it there.
 */
export const AUTOLOGIN_ATTEMPTED_COOKIE = "csa_autologin_attempted";

/** Session-scoped: no `maxAge`, so it dies with the browser session. */
export const AUTOLOGIN_ATTEMPTED_COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: "lax",
  path: "/",
  secure: process.env.NODE_ENV === "production",
} as const;

/** Short-lived by design; the demo is picked up and put down. */
const MAX_AGE_SECONDS = 60 * 60 * 8;

export const SESSION_COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: "lax",
  path: "/",
  maxAge: MAX_AGE_SECONDS,
  secure: process.env.NODE_ENV === "production",
} as const;

/**
 * Contract §13: "Session cookie or `Authorization: Bearer`."
 *
 * The cookie is how the portal carries it; the bearer header is how the Expo
 * app does, because `expo-secure-store` holds the token rather than a cookie
 * jar. Both resolve to the same subject.
 */
export function tokenFromRequest(request: NextRequest): string | null {
  const header = request.headers.get("authorization");
  if (header?.toLowerCase().startsWith("bearer ")) {
    const value = header.slice("bearer ".length).trim();
    if (value.length > 0) return value;
  }
  return request.cookies.get(SESSION_COOKIE)?.value ?? null;
}

/** The signed-in subject for a route handler, or null for a guest. */
export async function viewerIdFromRequest(request: NextRequest): Promise<Uuid | null> {
  return verifySession(tokenFromRequest(request));
}

/** The signed-in subject for a server component. */
export async function viewerIdFromCookies(): Promise<Uuid | null> {
  const store = await cookies();
  return verifySession(store.get(SESSION_COOKIE)?.value ?? null);
}
