import { describe, expect, it } from "vitest";

import { DEMO_IDS } from "./__fixtures__/factories";
import {
  TICKET_CODE_ALPHABET,
  TICKET_CODE_LENGTH,
  isTicketCode,
  isTicketTokenExpired,
  isTicketTokenShape,
  normalizeTicketCode,
  ticketTokenExpiresAt,
} from "./tickets";
import type { TicketTokenPayload } from "./tickets";

describe("ticket codes", () => {
  it("is 10 characters of Crockford base32", () => {
    expect(TICKET_CODE_LENGTH).toBe(10);
    expect(TICKET_CODE_ALPHABET).toHaveLength(32);
    for (const excluded of ["I", "L", "O", "U"]) {
      expect(TICKET_CODE_ALPHABET).not.toContain(excluded);
    }
  });

  it("accepts a well-formed code", () => {
    expect(isTicketCode("K3M9QZ7B2T")).toBe(true);
  });

  it("rejects the wrong length, lowercase, and excluded letters", () => {
    expect(isTicketCode("K3M9QZ7B2")).toBe(false);
    expect(isTicketCode("K3M9QZ7B2TX")).toBe(false);
    expect(isTicketCode("k3m9qz7b2t")).toBe(false);
    expect(isTicketCode("K3M9QZ7B2I")).toBe(false);
    expect(isTicketCode("")).toBe(false);
    expect(isTicketCode(null)).toBe(false);
  });

  it("normalises a hand-typed code the way Crockford decodes it", () => {
    expect(normalizeTicketCode("k3m9-qz7b2t")).toBe("K3M9QZ7B2T");
    expect(normalizeTicketCode(" k3m9 qz7b2t ")).toBe("K3M9QZ7B2T");
    expect(normalizeTicketCode("k3m9qz7bio")).toBe("K3M9QZ7B10");
    expect(normalizeTicketCode("LLLLLLLLLL")).toBe("1111111111");
  });

  it("normalisation is lossless for generated codes", () => {
    const generated = "K3M9QZ7B2T";
    expect(normalizeTicketCode(generated)).toBe(generated);
  });
});

describe("QR token payload", () => {
  const payload: TicketTokenPayload = {
    tid: "K3M9QZ7B2T",
    eid: DEMO_IDS.gala,
    exp: 1_780_000_000,
  };

  it("reads exp as Unix seconds", () => {
    expect(ticketTokenExpiresAt(payload)).toEqual(new Date(1_780_000_000_000));
  });

  it("is valid before exp and expired at exactly exp", () => {
    const expiry = ticketTokenExpiresAt(payload);
    expect(isTicketTokenExpired(payload, new Date(expiry.getTime() - 1))).toBe(false);
    expect(isTicketTokenExpired(payload, expiry)).toBe(true);
    expect(isTicketTokenExpired(payload, new Date(expiry.getTime() + 1))).toBe(true);
  });

  it("recognises the two-segment base64url token shape", () => {
    expect(isTicketTokenShape("eyJ0aWQiOiJLM005UVo3QjJUIn0.c2lnbmF0dXJl")).toBe(true);
    expect(isTicketTokenShape("eyJ0aWQiOiJLM005UVo3QjJUIn0")).toBe(false);
    expect(isTicketTokenShape("a.b.c")).toBe(false);
    expect(isTicketTokenShape("has+padding/chars.signature")).toBe(false);
  });
});
