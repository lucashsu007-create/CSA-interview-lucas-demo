/**
 * Contract §6 — the QR token and the signing endpoint.
 *
 * Schemas only. No key material and no crypto: the private key lives in server
 * secrets and the signature is produced by the Edge Function or Node route, and
 * verified by the scanner with the public key.
 */

import { TICKET_TOKEN_REGEX } from "@csa/domain";
import type { SignedTicket, TicketTokenPayload } from "@csa/domain";
import { z } from "zod";

import { isoDateTimeSchema, ticketCodeSchema, toDate, uuidSchema } from "./primitives";
import type { Assert, Exact } from "./type-utils";

/** The two base64url segments: `payload.signature`. Shape only, not a verification. */
export const ticketTokenSchema = z
  .string()
  .regex(TICKET_TOKEN_REGEX, "expected a base64url payload and signature separated by a dot");

/**
 * The signed payload. `strict()` matters here: an unexpected field in a security
 * token is a reason to reject it, not to ignore it.
 */
export const ticketTokenPayloadSchema = z
  .object({
    /** The ticket code, which is what `check_in_ticket` takes as `p_ticket_code`. */
    tid: ticketCodeSchema,
    eid: uuidSchema,
    /** Unix seconds. Contract §6: minutes of life, not days. */
    exp: z.number().int().positive(),
  })
  .strict();

export type _TicketTokenPayloadMatches = Assert<
  Exact<TicketTokenPayload, z.infer<typeof ticketTokenPayloadSchema>>
>;

/** `POST /functions/v1/sign-ticket` request body. */
export const signTicketRequestSchema = z.object({
  registrationId: uuidSchema,
});
export type SignTicketRequest = z.infer<typeof signTicketRequestSchema>;

/** The response as it goes over the wire — `expiresAt` is still a string here. */
export const signTicketResponseBodySchema = z.object({
  token: ticketTokenSchema,
  expiresAt: isoDateTimeSchema,
});
export type SignTicketResponseBody = z.infer<typeof signTicketResponseBodySchema>;

/** The same response as the client wants it, with `expiresAt` as a `Date`. */
export const signTicketResponseSchema = signTicketResponseBodySchema.transform(
  (body): SignedTicket => ({
    token: body.token,
    expiresAt: toDate(body.expiresAt),
  }),
);

export function parseSignTicketResponse(value: unknown): SignedTicket {
  return signTicketResponseSchema.parse(value);
}
