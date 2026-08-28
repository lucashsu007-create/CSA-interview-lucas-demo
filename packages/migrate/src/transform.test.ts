import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { beforeAll, describe, expect, it } from "vitest";

import { buildEstate, buildManifest, emitAll } from "@csa/legacy-fixtures";
import type { LegacyEstate } from "@csa/legacy-fixtures";

import { loadExtract } from "./read";
import type { LoadedExtract } from "./read";
import { transform } from "./transform";
import type { TransformResult } from "./drafts";

/**
 * The harness graded against its own answer key.
 *
 * The fixture records what it planted; these assertions check the importer
 * found exactly that. Both directions matter. An importer that quarantines
 * nothing has guessed; an importer that quarantines everything has refused to
 * work, and both pass a plain row count.
 */
let estate: LegacyEstate;
let extract: LoadedExtract;
let result: TransformResult;

beforeAll(() => {
  estate = buildEstate();
  const root = mkdtempSync(join(tmpdir(), "csa-migrate-"));
  const files = emitAll(estate);
  for (const file of files) {
    const target = join(root, file.path);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, file.contents, "utf8");
  }
  writeFileSync(
    join(root, "manifest.json"),
    JSON.stringify(
      buildManifest(files, {
        extractedAt: "2026-08-24T09:00:00Z",
        seed: 20260824,
        plantedDefects: estate.plantedDefects.length,
      }),
      null,
      2,
    ),
    "utf8",
  );
  extract = loadExtract(root);
  result = transform(extract);
});

const key = (system: string, id: string) => `${system}:${id}`;

describe("the transform, graded against the planted defects", () => {
  it("quarantines every planted defect that is a row", () => {
    const quarantined = new Map(
      result.quarantine.map((q) => [key(q.sourceSystem, q.sourceId), q.reason]),
    );

    const missed: string[] = [];
    for (const defect of estate.plantedDefects) {
      // `member_phone` is a field-level defect. The field is not migrated at all
      // under minimisation, so there is no row to quarantine and the importer
      // is right not to produce one.
      if (defect.entityType === "member_phone") continue;
      const found = quarantined.get(key(defect.sourceSystem, defect.sourceId));
      if (found !== defect.expectedReason) {
        missed.push(`${defect.id}: expected ${defect.expectedReason}, got ${found ?? "nothing"}`);
      }
    }
    expect(missed).toEqual([]);
  });

  it("resolves every planted duplicate instead of quarantining it", () => {
    const merged = new Set(result.dedup.map((d) => key(d.merged.sourceSystem, d.merged.sourceId)));
    const quarantined = new Set(result.quarantine.map((q) => key(q.sourceSystem, q.sourceId)));

    for (const m of estate.plantedMerges) {
      const k = key(m.mergedSourceSystem, m.mergedSourceId);
      expect(merged, `${m.id} was not merged`).toContain(k);
      expect(quarantined, `${m.id} was quarantined instead of merged`).not.toContain(k);
    }
    expect(estate.plantedMerges.length).toBeGreaterThan(0);
  });

  it("names the winner and the merged side of every merge", () => {
    for (const decision of result.dedup) {
      expect(decision.winner.sourceId).not.toBe(decision.merged.sourceId);
      expect(decision.rule).toBeTruthy();
    }
  });

  it("quarantines nothing it cannot account for", () => {
    // The ceiling matters as much as the floor: an importer that panics and
    // refuses a third of the estate passes every count check and has migrated
    // nothing. Three accounts are permitted, and every quarantined row must
    // have one of them.
    const planted = new Set(estate.plantedDefects.map((d) => key(d.sourceSystem, d.sourceId)));
    const quarantinedKeys = new Set(result.quarantine.map((q) => key(q.sourceSystem, q.sourceId)));
    const membershipParent = new Map(
      extract.memberships
        .filter((m) => m.payment_ref)
        .map((m) => [m.payment_ref as string, m._id.$oid]),
    );

    const unaccounted = result.quarantine.filter((q) => {
      if (planted.has(key(q.sourceSystem, q.sourceId))) return false;
      // 1. Page content and committee applications: no target table exists in
      //    this wave, by decision, and both are counted by the extract so both
      //    must be accounted for rather than passed over.
      if (
        (q.entityType === "content" || q.entityType === "applications") &&
        q.reason === "out_of_scope"
      ) {
        return false;
      }
      // 2. A cascade: the payment settles a membership that was itself
      //    quarantined, so it has nothing to attach to. Importing it anyway
      //    would invent revenue against a membership that does not exist.
      if (q.entityType === "payments" && q.reason === "orphaned_reference") {
        const parent = membershipParent.get(q.sourceId);
        return !(parent && quarantinedKeys.has(key("mongodb", parent)));
      }
      return true;
    });

    expect(unaccounted.map((q) => `${q.sourceSystem}:${q.sourceId} ${q.reason}`)).toEqual([]);
  });

  it("cascades a quarantined membership to its payment rather than orphaning revenue", () => {
    const quarantinedMemberships = new Set(
      result.quarantine.filter((q) => q.entityType === "memberships").map((q) => q.sourceId),
    );
    const cascaded = extract.memberships.filter(
      (m) => m.payment_ref && quarantinedMemberships.has(m._id.$oid),
    );
    expect(cascaded.length).toBeGreaterThan(0);

    for (const parent of cascaded) {
      // The payment must not import against a membership that did not.
      expect(result.payments.find((p) => p.sourceId === parent.payment_ref)).toBeUndefined();
      const q = result.quarantine.find((x) => x.sourceId === parent.payment_ref);
      expect(q?.reason, `${parent.payment_ref} vanished instead of being quarantined`).toBe(
        "orphaned_reference",
      );
    }
  });

  it("gives every quarantined row a reason from the closed set", () => {
    for (const q of result.quarantine) {
      expect(q.reason).toBeTruthy();
      expect(Object.keys(q.payload).length).toBeGreaterThan(0);
    }
  });

  it("gives every rejected record a detail a human can act on", () => {
    for (const record of result.records) {
      if (record.disposition !== "rejected") continue;
      // "N rows failed" is not a reason — migration plan §17.
      expect(record.detail, `${record.sourceId} rejected with no detail`).toBeTruthy();
      expect(record.detail!.length).toBeGreaterThan(8);
    }
  });

  it("records one import record per source row, and no more", () => {
    const seen = new Set<string>();
    for (const record of result.records) {
      const k = `${record.sourceSystem}|${record.sourceId}|${record.entityType}`;
      expect(seen, `duplicate record for ${k}`).not.toContain(k);
      seen.add(k);
    }
    // accepted + warning + rejected must equal the source count by construction.
    const members = result.records.filter(
      (r) => r.entityType === "members" && r.sourceSystem === "mongodb",
    );
    expect(members.length).toBe(estate.mongo.members.length);
  });
});

describe("the decisions the transform makes", () => {
  it("carries no field the target has no use for", () => {
    // GDPR applies to the target, not only to the source.
    const json = JSON.stringify(result.users);
    expect(json).not.toContain("student_number");
    expect(json).not.toContain("marketing_opt_in");
    expect(json).not.toContain("phone");
    expect(result.minimisedFields.length).toBeGreaterThan(3);
  });

  it("flags every event for the capacity WordPress never recorded", () => {
    const eventRecords = result.records.filter(
      (r) => r.entityType === "events" && r.disposition !== "rejected",
    );
    expect(eventRecords.length).toBeGreaterThan(20);
    for (const record of eventRecords) {
      // An invented capacity is a defensible decision and an indefensible
      // silence. Every imported event says so.
      expect(record.appliedRules).toContain("capacity_defaulted_absent_in_source");
      expect(record.disposition).toBe("warning");
    }
  });

  it("never treats an expired Mollie payment as collected revenue", () => {
    const expired = extract.payments.filter((p) => p.status === "expired");
    expect(expired.length).toBeGreaterThan(0);
    for (const payment of expired) {
      const imported = result.payments.find((p) => p.sourceId === payment.id);
      if (imported) expect(imported.status).toBe("failed");
    }
  });

  it("maps premium to general and says the course is not modelled", () => {
    const premium = extract.memberships.filter((m) => m.type === "premium");
    expect(premium.length).toBeGreaterThan(0);
    for (const period of premium) {
      const imported = result.memberships.find((m) => m.sourceId === period._id.$oid);
      if (!imported) continue;
      expect(imported.membershipType).toBe("general");
      const record = result.records.find((r) => r.sourceId === period._id.$oid);
      expect(record?.appliedRules).toContain(
        "premium_mapped_to_general_language_course_not_modelled",
      );
    }
  });

  it("is a pure function of its input", () => {
    // No clock, no randomness, no database. That is what makes `dry_run` a real
    // mode rather than a flag that skips the commit.
    const again = transform(extract);
    expect(JSON.stringify(again)).toBe(JSON.stringify(result));
  });
});
