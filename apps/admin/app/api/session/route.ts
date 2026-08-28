import { signSession } from "@csa/api-client";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { resolveIdentityByEmail } from "@/lib/data";
import { jsonError, jsonFromError } from "@/lib/http";
import { isDemoIdentityEmail } from "@/lib/identities";
import { SESSION_COOKIE, SESSION_COOKIE_OPTIONS } from "@/lib/session";

export const dynamic = "force-dynamic";

/**
 * `POST /api/session` — pick a seeded demo identity, returns the token.
 *
 * The token goes back in the BODY for the Expo app, which keeps it in
 * `expo-secure-store` and sends it as `Authorization: Bearer`, AND is set as an
 * httpOnly cookie for the portal, which never touches it from script. One route
 * serves both because contract §13 says both are accepted.
 *
 * Only the four identities in contract §7 can be picked. That allowlist is the
 * entire authentication story and it is deliberately not a login: there is no
 * password to check because `.local` is undeliverable, so a magic link cannot
 * arrive. An arbitrary email would be an unauthenticated impersonation
 * endpoint, which is why the check is on a closed list rather than on "does
 * this user exist".
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  let email: unknown;
  try {
    const body: unknown = await request.json();
    email = typeof body === "object" && body !== null ? (body as { email?: unknown }).email : null;
  } catch {
    return jsonError("invalid_body");
  }

  if (!isDemoIdentityEmail(email)) {
    return jsonError("invalid_body");
  }

  try {
    const identity = await resolveIdentityByEmail(email);
    if (identity === null) return jsonError("user_not_found");

    const token = await signSession(identity.id);

    const response = NextResponse.json({
      token,
      user: {
        id: identity.id,
        email: identity.email,
        fullName: identity.fullName,
        role: identity.role,
      },
    });
    response.cookies.set(SESSION_COOKIE, token, SESSION_COOKIE_OPTIONS);
    return response;
  } catch (error) {
    return jsonFromError(error, "POST /api/session");
  }
}

/** `DELETE /api/session` — sign out. Clearing the cookie is the whole of it. */
export function DELETE(): NextResponse {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE, "", { ...SESSION_COOKIE_OPTIONS, maxAge: 0 });
  return response;
}
