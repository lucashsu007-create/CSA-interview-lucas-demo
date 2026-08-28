/**
 * Contract §11 — the seeded-session token.
 *
 * No database here: the token is pure crypto and the only thing worth asserting
 * is that a forged, expired, mis-issued or mis-scoped token never resolves to a
 * user id. No test prints a token or a secret.
 */

import { SignJWT } from "jose";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  SESSION_AUDIENCE,
  SESSION_ISSUER,
  sessionClaimsJson,
  signSession,
  verifySession,
} from "./session";

const USER_ID = "93c9da93-7ffb-498e-afc1-2798ea05112e";
const OTHER_USER_ID = "b4191885-f836-4ccd-bfc4-e0ccaf88dcae";
const TEST_SECRET = "test-secret-for-the-csa-session-suite-0123456789";

const key = () => new TextEncoder().encode(TEST_SECRET);

let previousSecret: string | undefined;
let previousTtl: string | undefined;

beforeEach(() => {
  previousSecret = process.env["CSA_SESSION_SECRET"];
  previousTtl = process.env["CSA_SESSION_TTL_SECONDS"];
  process.env["CSA_SESSION_SECRET"] = TEST_SECRET;
  delete process.env["CSA_SESSION_TTL_SECONDS"];
});

afterEach(() => {
  if (previousSecret === undefined) delete process.env["CSA_SESSION_SECRET"];
  else process.env["CSA_SESSION_SECRET"] = previousSecret;

  if (previousTtl === undefined) delete process.env["CSA_SESSION_TTL_SECONDS"];
  else process.env["CSA_SESSION_TTL_SECONDS"] = previousTtl;
});

/** Mints a token directly, so a test can vary one claim at a time. */
async function mint(
  claims: Record<string, unknown>,
  options: { subject?: string; issuer?: string; audience?: string; expiresAt?: number } = {},
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  let jwt = new SignJWT(claims)
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuedAt(now - 60)
    .setIssuer(options.issuer ?? SESSION_ISSUER)
    .setAudience(options.audience ?? SESSION_AUDIENCE)
    .setExpirationTime(options.expiresAt ?? now + 300);
  if (options.subject !== undefined) jwt = jwt.setSubject(options.subject);
  return jwt.sign(key());
}

describe("signSession / verifySession", () => {
  it("round-trips the user id", async () => {
    const token = await signSession(USER_ID);
    await expect(verifySession(token)).resolves.toBe(USER_ID);
  });

  it("returns null for no token, so a caller can pass a missing cookie straight in", async () => {
    await expect(verifySession(null)).resolves.toBeNull();
    await expect(verifySession("")).resolves.toBeNull();
  });

  it("rejects a token signed with a different secret", async () => {
    const token = await signSession(USER_ID);
    process.env["CSA_SESSION_SECRET"] = `${TEST_SECRET}-rotated`;
    await expect(verifySession(token)).resolves.toBeNull();
  });

  it("rejects a tampered payload", async () => {
    const token = await signSession(USER_ID);
    const [header, , signature] = token.split(".");
    const forged = Buffer.from(
      JSON.stringify({ sub: OTHER_USER_ID, role: "authenticated" }),
      "utf8",
    ).toString("base64url");
    await expect(verifySession(`${header}.${forged}.${signature}`)).resolves.toBeNull();
  });

  it("rejects an expired token", async () => {
    const expired = await mint(
      { role: "authenticated" },
      { subject: USER_ID, expiresAt: Math.floor(Date.now() / 1000) - 1 },
    );
    await expect(verifySession(expired)).resolves.toBeNull();
  });

  it("rejects another issuer or another audience", async () => {
    const wrongIssuer = await mint(
      { role: "authenticated" },
      { subject: USER_ID, issuer: "somebody-else" },
    );
    const wrongAudience = await mint(
      { role: "authenticated" },
      { subject: USER_ID, audience: "another-api" },
    );
    await expect(verifySession(wrongIssuer)).resolves.toBeNull();
    await expect(verifySession(wrongAudience)).resolves.toBeNull();
  });

  it("refuses a role other than authenticated, so a forged service_role is not a session", async () => {
    const escalated = await mint({ role: "service_role" }, { subject: USER_ID });
    await expect(verifySession(escalated)).resolves.toBeNull();
  });

  it("refuses a subject that is not a uuid", async () => {
    const notAUuid = await mint({ role: "authenticated" }, { subject: "member@demo.local" });
    await expect(verifySession(notAUuid)).resolves.toBeNull();

    const noSubject = await mint({ role: "authenticated" });
    await expect(verifySession(noSubject)).resolves.toBeNull();
  });

  it("refuses to sign anything that is not a uuid", async () => {
    await expect(signSession("not-a-uuid")).rejects.toThrow(TypeError);
  });

  it("honours a shorter ttl", async () => {
    process.env["CSA_SESSION_TTL_SECONDS"] = "120";
    const token = await signSession(USER_ID);
    const payload = JSON.parse(
      Buffer.from(token.split(".")[1] ?? "", "base64url").toString("utf8"),
    ) as { exp: number; iat: number };
    expect(payload.exp - payload.iat).toBe(120);
  });

  it("refuses a secret too short to be worth having", async () => {
    process.env["CSA_SESSION_SECRET"] = "too-short";
    await expect(signSession(USER_ID)).rejects.toThrow(/CSA_SESSION_SECRET/);
  });
});

describe("sessionClaimsJson", () => {
  it("is exactly the GUC value Supabase publishes", () => {
    expect(sessionClaimsJson(USER_ID)).toBe(`{"sub":"${USER_ID}","role":"authenticated"}`);
  });

  it("refuses anything that is not a uuid, so nothing odd reaches the GUC", () => {
    expect(() => sessionClaimsJson("' or true --")).toThrow(TypeError);
  });
});
