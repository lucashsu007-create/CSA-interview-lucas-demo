/**
 * Contract §2 and §5 step 5.
 *
 * Role NEVER determines pricing. `resolvePrice` takes no user and no role — it
 * cannot consult one — so an admin or staff account with no active membership
 * resolves to the public price by construction, not by discipline.
 *
 * The authoritative resolution still happens inside `register_for_event`; this
 * is the same rule for display, so the price on the button matches the price
 * the server writes.
 */

import type { PaymentStatus } from "./enums";
import type { Cents } from "./money";

/** The minimum shape of an event needed to price it. Satisfied by `Event`. */
export interface EventPricing {
  readonly priceMemberCents: Cents;
  readonly pricePublicCents: Cents;
}

export interface ResolvedPrice {
  readonly cents: Cents;
  /** Written to `registrations.is_member_price`. */
  readonly isMemberPrice: boolean;
}

export function resolvePrice(event: EventPricing, hasActiveMembership: boolean): ResolvedPrice {
  return hasActiveMembership
    ? { cents: event.priceMemberCents, isMemberPrice: true }
    : { cents: event.pricePublicCents, isMemberPrice: false };
}

/**
 * Contract §5 step 7: `payment_status` is `paid` when the resolved price is 0,
 * otherwise `pending`. A free event needs no payment to be a valid registration.
 */
export function initialPaymentStatus(resolvedCents: Cents): PaymentStatus {
  return resolvedCents === 0 ? "paid" : "pending";
}
