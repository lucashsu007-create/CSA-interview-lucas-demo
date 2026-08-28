/**
 * The shapes the legacy estate is in — deliberately NOT the target shapes.
 *
 * Everything here is modelled on what CSA publishes about itself rather than on
 * what would be convenient to import: WordPress with Elementor, a MongoDB
 * membership database, Google Forms, Mollie/iDEAL, and an in-person office
 * register. Contract §15 lists the public evidence for each.
 *
 * The fields are loose on purpose. A legacy record has strings where the target
 * has enums, one date format per person who ever typed one, and no capacity at
 * all. Tightening these here would move the migration's real work into the
 * fixture and make the importer look cleverer than it is.
 */
import type { QuarantineReason } from "@csa/domain";

/** MongoDB `members` — one document per person, as the committee database has it. */
export interface MongoMember {
  readonly _id: { readonly $oid: string };
  /** Free text. Sometimes shouting, sometimes wrapped in a display name, sometimes absent. */
  readonly email: string;
  readonly name: string;
  /** National number with no country code on the older records. */
  readonly phone?: string;
  readonly country?: string;
  readonly student_number?: string;
  /** ISO on the newer records, `dd-mm-yyyy` on the older ones. */
  readonly created_at: string;
  readonly marketing_opt_in?: boolean;
}

/** MongoDB `memberships` — the period, joined to a member by oid. */
export interface MongoMembership {
  readonly _id: { readonly $oid: string };
  readonly member_id: { readonly $oid: string };
  /** `general` or `premium`. Premium bundles a language course; the target does not model one yet. */
  readonly type: string;
  readonly status: string;
  readonly start_date: string;
  readonly end_date: string;
  /** Decimal string with a currency symbol on some rows. Never trust it as a number. */
  readonly amount: string;
  readonly payment_ref?: string;
}

/** A WordPress export item: pages, posts and the `csa_event` custom post type. */
export interface WpItem {
  readonly postId: number;
  readonly postType: "page" | "post" | "csa_event";
  readonly title: string;
  readonly slug: string;
  readonly link: string;
  readonly pubDate: string;
  readonly status: "publish" | "draft";
  readonly content: string;
  readonly postmeta: Readonly<Record<string, string>>;
}

/** A Google Forms response row, exactly as the CSV comes out. */
export interface FormResponse {
  /**
   * Google Forms gives a response no stable identifier in the CSV, so the
   * extract assigns one from the row position and records that it did. Where a
   * source has no identifier, inventing one at extract time and writing that
   * down is the only way a later delta import can tell old rows from new ones.
   */
  readonly rowId: string;
  readonly timestamp: string;
  readonly emailAddress: string;
  readonly fullName: string;
  /** Free text typed by the member. Matching this to an event is the transform's problem. */
  readonly whichEvent: string;
  readonly memberAnswer: string;
}

/** A Mollie payment export row. */
export interface MolliePayment {
  readonly id: string;
  /** Mollie's vocabulary, not the contract's: open, paid, failed, expired, refunded. */
  readonly status: string;
  readonly amount: string;
  readonly description: string;
  readonly createdAt: string;
  readonly method: string;
}

/** A line from the in-person office register — the intake with no software behind it. */
export interface LedgerEntry {
  /** Assigned by the extract from the page and line number; the paper has none. */
  readonly rowId: string;
  readonly date: string;
  readonly name: string;
  readonly email: string;
  readonly amount: string;
  readonly handledBy: string;
  readonly notes: string;
}

/**
 * A defect the generator planted on purpose, with the reason the importer is
 * expected to quarantine it under.
 *
 * This is what makes the harness self-verifying rather than merely green: a test
 * can assert that the importer quarantined exactly these rows, for exactly these
 * reasons, and nothing else. An importer that quarantines too much passes a
 * count check and fails this one.
 */
export interface PlantedDefect {
  readonly id: string;
  readonly sourceSystem: string;
  readonly sourceId: string;
  readonly entityType: string;
  readonly expectedReason: QuarantineReason;
  readonly note: string;
}

/**
 * A duplicate the approved rules are expected to RESOLVE rather than quarantine.
 *
 * Kept apart from the defects on purpose. A harness graded only on what it
 * quarantines rewards an importer that quarantines everything; this is the
 * other half of the key, and it fails the importer that refuses to merge the
 * cases the rules were written for.
 */
export interface PlantedMerge {
  readonly id: string;
  readonly winnerSourceSystem: string;
  readonly winnerSourceId: string;
  readonly mergedSourceSystem: string;
  readonly mergedSourceId: string;
  readonly note: string;
}

export interface LegacyEstate {
  readonly mongo: {
    readonly members: readonly MongoMember[];
    readonly memberships: readonly MongoMembership[];
  };
  readonly wordpress: readonly WpItem[];
  readonly forms: {
    readonly eventSignups: readonly FormResponse[];
    readonly actives: readonly FormResponse[];
  };
  readonly mollie: readonly MolliePayment[];
  readonly ledger: readonly LedgerEntry[];
  readonly plantedDefects: readonly PlantedDefect[];
  readonly plantedMerges: readonly PlantedMerge[];
}
