/**
 * Contract §11 — sessions without GoTrue.
 *
 * There is no local GoTrue and no PostgREST on this machine, so picking a seeded
 * demo identity mints an HS256 JWT here instead. The token carries
 * `sub = public.users.id` and `role = authenticated`, which is exactly the claim
 * set Supabase publishes in `request.jwt.claims` — so the same token shape works
 * unchanged when a real Supabase project replaces the driver.
 *
 * The token is a *session* credential: it says who the caller is. It is not the
 * QR ticket token, which is Ed25519 and signed elsewhere (contract §6). Nothing
 * in this module touches ticket signing, and nothing here ever logs a token or
 * the secret.
 */

import { isUuid } from "@csa/domain";
import type { Uuid } from "@csa/domain";
import { SignJWT, jwtVerify } from "jose";

/**
 * Only ever used when `CSA_SESSION_SECRET` is unset. It is a published constant,
 * so a token signed with it proves nothing — that is the point: a deployment
 * that forgets to set the real secret must not silently look secure.
 *
 * Deliberately not exported. Set `CSA_SESSION_SECRET` (32+ characters) in any
 * environment that is not a throwaway local demo.
 */
const DEV_FALLBACK_SECRET = "csa-dev-insecure-session-secret-set-CSA_SESSION_SECRET";

/** Minimum length accepted for a real secret. HS256 keys shorter than this are weak. */
const MIN_SECRET_LENGTH = 32;

export const SESSION_ISSUER = "csa-digital-hub";
export const SESSION_AUDIENCE = "csa-api";

/**
 * Short by design. A demo session is picked from a list of four seeded
 * identities and re-picking costs one click, so there is no reason to hold a
 * bearer token that outlives the demo. Override with `CSA_SESSION_TTL_SECONDS`.
 */
export const DEFAULT_SESSION_TTL_SECONDS = 60 * 60;

/** The claim set this module mints and accepts. Contract §11. */
export interface SessionClaims {
  readonly sub: Uuid;
  /** Always `authenticated`. `service_role` is never issued to a client. */
  readonly role: "authenticated";
}

let warnedAboutFallback = false;

function sessionSecret(): Uint8Array {
  const configured = process.env["CSA_SESSION_SECRET"];

  if (configured !== undefined && configured !== "") {
    if (configured.length < MIN_SECRET_LENGTH) {
      // The value is never included in the message.
      throw new Error(
        `CSA_SESSION_SECRET is too short: ${MIN_SECRET_LENGTH} characters or more are required.`,
      );
    }
    return new TextEncoder().encode(configured);
  }

  if (!warnedAboutFallback) {
    warnedAboutFallback = true;
    console.warn(
      "[csa/api-client] CSA_SESSION_SECRET is not set; falling back to the public development secret. " +
        "Sessions are forgeable. Set CSA_SESSION_SECRET before running anywhere that matters.",
    );
  }
  return new TextEncoder().encode(DEV_FALLBACK_SECRET);
}

function sessionTtlSeconds(): number {
  const raw = process.env["CSA_SESSION_TTL_SECONDS"];
  if (raw === undefined || raw === "") return DEFAULT_SESSION_TTL_SECONDS;

  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error("CSA_SESSION_TTL_SECONDS must be a positive whole number of seconds.");
  }
  return parsed;
}

/**
 * Mints the session token for a seeded demo identity.
 *
 * `userId` is a `public.users.id`. Contract §11: there is no `auth.users` to
 * link to, so the application user id *is* the subject — which is why open
 * decision 2 needed no schema change.
 */
export async function signSession(userId: Uuid): Promise<string> {
  if (!isUuid(userId)) {
    throw new TypeError("signSession expects a uuid");
  }

  const now = Math.floor(Date.now() / 1000);

  return new SignJWT({ role: "authenticated" })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(userId)
    .setIssuer(SESSION_ISSUER)
    .setAudience(SESSION_AUDIENCE)
    .setIssuedAt(now)
    .setNotBefore(now)
    .setExpirationTime(now + sessionTtlSeconds())
    .sign(sessionSecret());
}

/**
 * Resolves a token back to the user id it authorises, or null.
 *
 * Null rather than a throw for every rejection — a missing cookie, an expired
 * token and a forged token are all just "no session" to a caller, and the three
 * are not worth distinguishing to an unauthenticated client. A null token is
 * accepted directly so a caller can pass `cookies.get(...)?.value ?? null`
 * without a branch.
 */
export async function verifySession(token: string | null): Promise<Uuid | null> {
  if (token === null || token === "") return null;

  try {
    const { payload } = await jwtVerify(token, sessionSecret(), {
      algorithms: ["HS256"],
      issuer: SESSION_ISSUER,
      audience: SESSION_AUDIENCE,
    });

    // `role` is pinned: a token minted for anything other than an ordinary
    // signed-in user is not a session this client will act on.
    if (payload["role"] !== "authenticated") return null;

    const subject = payload.sub;
    return isUuid(subject) ? subject : null;
  } catch {
    return null;
  }
}

/**
 * The exact string handed to `set local request.jwt.claims`. Exported because
 * `db.ts` binds it as a parameter and the tests assert on its shape; keeping one
 * definition means the GUC and the JWT can never disagree about the claim names.
 */
export function sessionClaimsJson(userId: Uuid): string {
  if (!isUuid(userId)) {
    throw new TypeError("sessionClaimsJson expects a uuid");
  }
  const claims: SessionClaims = { sub: userId, role: "authenticated" };
  return JSON.stringify(claims);
}
