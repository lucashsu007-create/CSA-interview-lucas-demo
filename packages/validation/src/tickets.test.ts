import { describe, expect, it } from "vitest";

import {
  parseSignTicketResponse,
  signTicketRequestSchema,
  ticketTokenPayloadSchema,
  ticketTokenSchema,
} from "./tickets";

const EVENT_ID = "00000000-0000-4000-8000-0000000000a1";
const REGISTRATION_ID = "00000000-0000-4000-8000-0000000000c1";
const TOKEN = "eyJ0aWQiOiJLM005UVo3QjJUIn0.c2lnbmF0dXJlLWJ5dGVz";

describe("QR token payload", () => {
  const payload = { tid: "K3M9QZ7B2T", eid: EVENT_ID, exp: 1_780_000_000 };

  it("accepts the contract payload", () => {
    expect(ticketTokenPayloadSchema.parse(payload)).toEqual(payload);
  });

  it("rejects an unexpected field instead of ignoring it", () => {
    // A signed token is verified as a whole. An extra claim is a reason to stop.
    expect(ticketTokenPayloadSchema.safeParse({ ...payload, role: "admin" }).success).toBe(false);
  });

  it("rejects a tid that is not a ticket code", () => {
    expect(ticketTokenPayloadSchema.safeParse({ ...payload, tid: REGISTRATION_ID }).success).toBe(
      false,
    );
    expect(ticketTokenPayloadSchema.safeParse({ ...payload, tid: "k3m9qz7b2t" }).success).toBe(
      false,
    );
  });

  it("rejects a missing or non-integer expiry", () => {
    expect(ticketTokenPayloadSchema.safeParse({ tid: payload.tid, eid: payload.eid }).success).toBe(
      false,
    );
    expect(ticketTokenPayloadSchema.safeParse({ ...payload, exp: 1.5 }).success).toBe(false);
    expect(ticketTokenPayloadSchema.safeParse({ ...payload, exp: -1 }).success).toBe(false);
  });

  it("rejects an eid that is not a uuid", () => {
    expect(ticketTokenPayloadSchema.safeParse({ ...payload, eid: "gala" }).success).toBe(false);
  });
});

describe("token shape", () => {
  it("accepts two base64url segments separated by a dot", () => {
    expect(ticketTokenSchema.safeParse(TOKEN).success).toBe(true);
  });

  it("rejects an unsigned payload, standard base64 padding, or extra segments", () => {
    expect(ticketTokenSchema.safeParse("eyJ0aWQiOiJLM005UVo3QjJUIn0").success).toBe(false);
    expect(ticketTokenSchema.safeParse("eyJ0aWQi+/In0.c2ln").success).toBe(false);
    expect(ticketTokenSchema.safeParse("header.payload.signature").success).toBe(false);
  });
});

describe("POST /functions/v1/sign-ticket", () => {
  it("takes a registration id and nothing else", () => {
    expect(signTicketRequestSchema.parse({ registrationId: REGISTRATION_ID })).toEqual({
      registrationId: REGISTRATION_ID,
    });
    expect(signTicketRequestSchema.safeParse({ registrationId: "not-a-uuid" }).success).toBe(false);
    expect(signTicketRequestSchema.safeParse({}).success).toBe(false);
  });

  it("parses the response into a token and a Date", () => {
    const signed = parseSignTicketResponse({
      token: TOKEN,
      expiresAt: "2026-06-01T18:05:00+00:00",
    });

    expect(signed.token).toBe(TOKEN);
    expect(signed.expiresAt).toEqual(new Date("2026-06-01T18:05:00.000Z"));
  });

  it("rejects a response whose token is not a signed token", () => {
    expect(() =>
      parseSignTicketResponse({ token: "K3M9QZ7B2T", expiresAt: "2026-06-01T18:05:00+00:00" }),
    ).toThrow();
  });
});
