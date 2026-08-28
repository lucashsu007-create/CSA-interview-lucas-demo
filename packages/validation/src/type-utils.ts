/**
 * Compile-time equality between a Zod schema's inferred output and the hand
 * written domain type. `Assert<Exact<A, B>>` fails to compile when the two
 * shapes differ, which is the only reliable way to keep a schema and a type in
 * step without generating one from the other.
 */

export type Exact<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;

export type Assert<T extends true> = T;
