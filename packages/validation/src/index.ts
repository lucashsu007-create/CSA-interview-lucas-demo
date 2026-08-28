/**
 * @csa/validation — Zod schemas for the Wave 0 contract.
 *
 * Three layers, deliberately separate:
 *   - `rows`     — what PostgREST hands back: snake_case, timestamps as strings.
 *   - `parsers`  — the one mapping from a row to a `@csa/domain` object.
 *   - `entities` — the domain objects themselves, for validating what a client
 *                  is about to send or store.
 *
 * Plus the two RPCs and the sign-ticket endpoint.
 *
 * Domain types are not re-exported: types come from `@csa/domain`, schemas come
 * from here, and there is only ever one definition of each.
 */

export * from "./primitives";
export * from "./enums";
export * from "./rows";
export * from "./entities";
export * from "./parsers";
export * from "./rpc";
export * from "./tickets";
export type { Assert, Exact } from "./type-utils";
