import type { UserRole, Uuid } from "@csa/domain";

/**
 * The identity view model the shell renders.
 *
 * It lives in its own module, importing nothing but types, so client components
 * can hold the shape without dragging the database client into their bundle.
 *
 * `membership` is deliberately a resolved fact from the server, not a date range
 * for a component to judge. Membership validity comes from the domain package
 * and ultimately from the database; a component that decided it would be a
 * second source of truth, and the two would disagree.
 */
export interface Viewer {
  readonly id: Uuid;
  readonly email: string;
  readonly fullName: string;
  /** Permissions only. Never an input to pricing. */
  readonly role: UserRole;
  /** Present only when the server resolved an active membership period. */
  readonly membership: { readonly memberNumber: string; readonly expiresAt: Date } | null;
}

/** One row of the demo-identity switcher. */
export interface IdentityOption {
  readonly id: Uuid;
  readonly email: string;
  readonly fullName: string;
  readonly role: UserRole;
  readonly purpose: string;
}
