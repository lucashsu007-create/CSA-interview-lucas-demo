/**
 * @csa/domain — the shared vocabulary for the CSA Digital Hub prototype.
 *
 * Types for every table in the Wave 0 contract, the closed enums as runtime
 * values, integer-cent money, and the pure predicates that both the Expo app
 * and the Next.js admin portal need in order to agree with the database.
 *
 * Nothing here performs I/O. Every predicate takes the instant it should judge
 * against, so every rule is testable without a clock or a connection.
 */

export * from "./primitives";
export * from "./enums";
export * from "./money";
export * from "./entities";
export * from "./errors";
export * from "./membership";
export * from "./pricing";
export * from "./events";
export * from "./tickets";
export * from "./check-in";
