import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

/**
 * Demo auto-login (contract §7 seeded sessions, made hands-free).
 *
 * `middleware.ts` is deprecated in Next 16 and renamed to `proxy.ts`; this is
 * the same convention under the new name.
 *
 * The portal already has an identity switcher, so this exists only to remove
 * the click for a demo that opens straight into the committee view. It is OFF
 * unless `CSA_DEMO_AUTOLOGIN` names one of the four fictional identities, and
 * the proxy itself never touches the database — it only decides that a request
 * with no session should go and get one. Minting the token needs a database
 * lookup and the signing key, both of which belong in the Node runtime, so
 * that lives in `app/api/session/auto/route.ts`.
 *
 * Note that `process.env` is inlined into the edge bundle at build time, so
 * changing the variable takes a rebuild, not just a restart. Railway redeploys
 * on a variable change, which does that on its own.
 */
export function proxy(request: NextRequest): NextResponse {
  // Off by default: no variable, no redirect, no cost.
  if (!process.env["CSA_DEMO_AUTOLOGIN"]) return NextResponse.next();

  const url = request.nextUrl.clone();
  url.pathname = "/api/session/auto";
  url.search = "";
  url.searchParams.set("next", `${request.nextUrl.pathname}${request.nextUrl.search}`);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: [
    {
      /*
       * Portal pages only. `/api` is excluded because the Expo app authenticates
       * with `Authorization: Bearer` (contract §13) and must never be bounced
       * through a browser redirect, and the static paths are excluded because a
       * matcher without them redirects the CSS and JS too.
       */
      source: "/((?!api|_next/static|_next/image|brandmark.svg|favicon.ico).*)",
      /*
       * Runs only for a request that has neither cookie. Matcher values have to
       * be statically analysable, so these two names are literals here and must
       * be kept in step with `SESSION_COOKIE` and `AUTOLOGIN_ATTEMPTED_COOKIE`
       * in `lib/session.ts`.
       */
      missing: [
        { type: "cookie", key: "csa_session" },
        { type: "cookie", key: "csa_autologin_attempted" },
      ],
    },
  ],
};
