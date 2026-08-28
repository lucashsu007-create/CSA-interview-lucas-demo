/**
 * @csa/legacy-fixtures — a synthetic stand-in for CSA's current estate.
 *
 * WordPress with Elementor, a MongoDB membership database, Google Forms,
 * Mollie/iDEAL, and the in-person office register. Contract §15 records what is
 * publicly visible about each, which is all this is modelled on.
 *
 * Fictional data only, in every direction. The identities are combinatorial and
 * denote no one, every address is at a reserved undeliverable domain, and no
 * CSA system was read to produce any of it. A green import over these rows is
 * never described as a migration of anything — see the csa-claims skill.
 */
export { Rng } from "./rng";
export { person, messyEmail, alternateEmail } from "./people";
export type { FictionalPerson } from "./people";
export { buildEstate } from "./corpus";
export type { CorpusOptions } from "./corpus";
export { emitAll, toWxr, toCsv, toJsonl, formsCsv, mollieCsv, ledgerCsv } from "./emit";
export type { ExtractFile } from "./emit";
export { buildManifest, sha256 } from "./manifest";
export type { Manifest, ManifestEntry, ManifestOptions } from "./manifest";
export type * from "./types";
