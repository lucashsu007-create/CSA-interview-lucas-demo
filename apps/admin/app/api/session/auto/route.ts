import { signSession } from "@csa/api-client";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { resolveIdentityByEmail } from "@/lib/data";
import { isDemoIdentityEmail } from "@/lib/identities";
import {
  AUTOLOGIN_ATTEMPTED_COOKIE,
  AUTOLOGIN_ATTEMPTED_COOKIE_OPTIONS,
  SESSION_COOKIE,
  SESSION_COOKIE_OPTIONS,
} from "@/lib/session";

export const dynamic = "force-dynamic";

/**
 * `GET /api/session/auto` — mint the configured demo session and go back.
 *
 * Only `proxy.ts` sends anyone here, and only when the request carries no
 * session. This is the same seeded-session mechanism as `POST /api/session`,
 * with the identity coming from `CSA_DEMO_AUTOLOGIN` instead of from a click;
 * the allowlist check is the same one, so an arbitrary address still cannot be
 * impersonated by setting the variable to it.
 */

/**
 * Same-origin absolute paths only.
 *
 * `//evil.com` is a protocol-relative URL and `https://evil.com` an absolute
 * one, and both would otherwise turn a sign-in redirect into an open redirect —
 * the classic way a demo convenience becomes a phishing primitive.
 */
function safeNext(raw: string | null): string {
  if (raw === null || !raw.startsWith("/") || raw.startsWith("//")) return "/";
  return raw;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  /*
   * A RELATIVE `Location`, resolved by the browser against the URL it asked
   * for, rather than `NextResponse.redirect()` and an absolute URL.
   *
   * Behind a proxy — Railway here — this handler sees the internal bind address
   * in `request.nextUrl.origin`, so an absolute redirect built from it sends the
   * browser to `0.0.0.0:8080`. Reconstructing the public origin from
   * `x-forwarded-host` would mean trusting a client-settable header to build a
   * redirect target. Staying relative needs neither and cannot point off-origin.
   */
  const response = new NextResponse(null, {
    status: 307,
    headers: { Location: safeNext(request.nextUrl.searchParams.get("next")) },
  });

  /*
   * Set unconditionally, and before anything that can fail. It is the only
   * thing standing between a misconfigured variable and an infinite redirect,
   * so it must survive every path through this handler.
   */
  response.cookies.set(AUTOLOGIN_ATTEMPTED_COOKIE, "1", AUTOLOGIN_ATTEMPTED_COOKIE_OPTIONS);

  const configured = process.env["CSA_DEMO_AUTOLOGIN"]?.trim().toLowerCase();
  if (!isDemoIdentityEmail(configured)) return response;

  try {
    const identity = await resolveIdentityByEmail(configured);
    if (identity !== null) {
      response.cookies.set(SESSION_COOKIE, await signSession(identity.id), SESSION_COOKIE_OPTIONS);
    }
  } catch {
    /*
     * A database that is not up yet, or a seed that has not run, must not make
     * the portal unreachable. Fall through as a guest and let the identity
     * switcher do it by hand.
     */
  }

  return response;
}
