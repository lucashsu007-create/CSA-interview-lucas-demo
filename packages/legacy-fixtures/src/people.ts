/**
 * Fictional identities for the synthetic estate.
 *
 * Names are assembled combinatorially from two fixed word lists. They denote no
 * one: the lists were written for this file, the pairing is a seeded index, and
 * every address is at `.local` or `.invalid` — both reserved by RFC 2606 and
 * RFC 6761 and therefore undeliverable by construction. This is the same rule
 * the demo identities follow (contract §7) and it is not negotiable: no real
 * member, ticket or payment data enters this repo.
 */
import { Rng } from "./rng";

const GIVEN = [
  "Wen",
  "Astrid",
  "Jiahao",
  "Noor",
  "Tycho",
  "Meilin",
  "Ruben",
  "Sanne",
  "Haoran",
  "Elif",
  "Joris",
  "Yuxin",
  "Fenna",
  "Bilal",
  "Siwei",
  "Marit",
  "Daan",
  "Qingyu",
  "Iris",
  "Kwame",
  "Lotte",
  "Ziyi",
  "Pepijn",
  "Amara",
] as const;

const FAMILY = [
  "Veldkamp",
  "Bosgraaf",
  "Nieuwland",
  "Rietveld",
  "Haagsma",
  "Doorn",
  "Kwakernaat",
  "Vermeulen",
  "Oostbroek",
  "Steenhuis",
  "Terlouw",
  "Zandvliet",
  "Lammerts",
  "Broekhuis",
  "Wijngaard",
  "Kortenhoeff",
] as const;

export interface FictionalPerson {
  readonly givenName: string;
  readonly familyName: string;
  readonly fullName: string;
  /** Canonical, lowercased, undeliverable. */
  readonly email: string;
}

/**
 * `index` drives the pairing, so the nth person is the same person on every run
 * and across every source. That is what lets one human appear in MongoDB and in
 * the office ledger and still be the same human for deduplication.
 */
export function person(index: number): FictionalPerson {
  const givenName = GIVEN[index % GIVEN.length] as string;
  const familyName = FAMILY[Math.floor(index / GIVEN.length) % FAMILY.length] as string;
  const suffix = Math.floor(index / (GIVEN.length * FAMILY.length));
  const slug = `${givenName}.${familyName}${suffix > 0 ? suffix : ""}`.toLowerCase();
  return {
    givenName,
    familyName,
    fullName: `${givenName} ${familyName}`,
    email: `${slug}@demo.local`,
  };
}

/**
 * The same address as a legacy system would actually have stored it: stray
 * whitespace, shouting, a display name wrapped around it. Every variant still
 * normalises to the canonical address, which is precisely what the importer's
 * transform has to prove it does.
 */
export function messyEmail(p: FictionalPerson, rng: Rng): string {
  const variant = rng.int(0, 4);
  switch (variant) {
    case 0:
      return p.email.toUpperCase();
    case 1:
      return `  ${p.email} `;
    case 2:
      return `${p.fullName} <${p.email}>`;
    case 3:
      return p.email.replace("@", " @ ");
    default:
      return p.email;
  }
}

/** A near-miss spelling: the same person, typed again at the office desk. */
export function alternateEmail(p: FictionalPerson): string {
  return `${p.givenName}${p.familyName}`.toLowerCase() + "@fixture.invalid";
}
