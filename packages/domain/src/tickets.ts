/**
 * Contract §6 — tickets and signing.
 *
 * `ticket_code` is 10 characters of Crockford base32 from a CSPRNG: unique,
 * non-sequential, and not derived from any id. Generation belongs to the
 * database function; this module owns the shape, so the generator, the scanner
 * and the manual-entry field agree on one alphabet.
 *
 * No crypto here. Signing is Ed25519 in a server-side signer that holds the
 * private key; the scanner ships the public key only.
 */

import type { Uuid } from "./primitives";

export const TICKET_CODE_LENGTH = 10;

/** Crockford base32: no I, L, O or U, so nothing reads as another character. */
export const TICKET_CODE_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

export const TICKET_CODE_REGEX = /^[0-9ABCDEFGHJKMNPQRSTVWXYZ]{10}$/;

export function isTicketCode(value: unknown): value is string {
  return typeof value === "string" && TICKET_CODE_REGEX.test(value);
}

/**
 * Canonicalises a hand-typed or badly-scanned code: strips spacing and hyphens,
 * uppercases, and applies Crockford's decoding equivalences (I and L read as 1,
 * O reads as 0). Lossless for generated codes, since the alphabet excludes those
 * letters.
 */
export function normalizeTicketCode(raw: string): string {
  return raw.replace(/[\s-]/g, "").toUpperCase().replace(/[IL]/g, "1").replace(/O/g, "0");
}

/**
 * The signed half of the QR payload:
 * `base64url(JSON{ tid, eid, exp }) + "." + base64url(ed25519_signature)`.
 */
export interface TicketTokenPayload {
  /** The ticket code — the value `check_in_ticket` takes as `p_ticket_code`. */
  readonly tid: string;
  /** The event the ticket is valid for. */
  readonly eid: Uuid;
  /** Expiry as a Unix timestamp in **seconds**. Minutes of life, not days. */
  readonly exp: number;
}

/** Two base64url segments separated by a dot. Shape only — not a verification. */
export const TICKET_TOKEN_REGEX = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;

export function isTicketTokenShape(value: unknown): value is string {
  return typeof value === "string" && TICKET_TOKEN_REGEX.test(value);
}

/** The response of `POST /functions/v1/sign-ticket`. */
export interface SignedTicket {
  readonly token: string;
  readonly expiresAt: Date;
}

export function ticketTokenExpiresAt(payload: TicketTokenPayload): Date {
  return new Date(payload.exp * 1000);
}

/** Expired at exactly `exp`, matching the JWT convention of `now >= exp`. */
export function isTicketTokenExpired(payload: TicketTokenPayload, at: Date): boolean {
  return at.getTime() >= payload.exp * 1000;
}
