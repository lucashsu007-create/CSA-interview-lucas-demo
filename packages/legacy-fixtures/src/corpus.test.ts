import { describe, expect, it } from "vitest";

import { QUARANTINE_REASONS } from "@csa/domain";

import { buildEstate } from "./corpus";
import { emitAll, toCsv, toWxr } from "./emit";
import { buildManifest, sha256 } from "./manifest";

const AT = "2026-08-24T09:00:00Z";

describe("the synthetic legacy estate", () => {
  it("is byte-identical for the same seed", () => {
    const a = emitAll(buildEstate({ seed: 7 }));
    const b = emitAll(buildEstate({ seed: 7 }));

    // Determinism is not tidiness here. A reconciliation compares a count taken
    // at extract time against a count taken after the load; if the corpus moved
    // between the two, a green comparison proves nothing.
    expect(a.map((f) => sha256(f.contents))).toEqual(b.map((f) => sha256(f.contents)));
  });

  it("is a different estate for a different seed", () => {
    const a = emitAll(buildEstate({ seed: 7 }));
    const b = emitAll(buildEstate({ seed: 8 }));
    expect(sha256(a[1]!.contents)).not.toEqual(sha256(b[1]!.contents));
  });

  it("holds no deliverable address", () => {
    const estate = buildEstate();
    const addresses = [
      ...estate.mongo.members.map((m) => m.email),
      ...estate.forms.eventSignups.map((r) => r.emailAddress),
      ...estate.forms.actives.map((r) => r.emailAddress),
      ...estate.ledger.map((e) => e.email),
    ].filter((a) => a.trim() !== "");

    // `.local` and `.invalid` are reserved and cannot resolve. This is the
    // fictional-data rule made mechanical: a fixture that could reach a real
    // inbox is a fixture that got a real address into the repo.
    for (const address of addresses) {
      // Compared on the domain alone: a legacy record stores `NAME <a @ b>` and
      // worse, and the invariant under test is the destination, not the shape.
      const domain = address
        .toLowerCase()
        .replace(/[\s>]+/g, "")
        .split("@")
        .pop();
      expect(domain, address).toMatch(/^(demo\.local|fixture\.invalid)$/);
    }
    expect(addresses.length).toBeGreaterThan(100);
  });

  it("exercises every quarantine reason in the closed set", () => {
    const planted = buildEstate().plantedDefects;
    const reasons = new Set(planted.map((d) => d.expectedReason));

    // A harness that never produces `unresolvable_country` has not tested the
    // branch that refuses to guess a country, and the closed set would be
    // carrying a value nothing can reach.
    for (const reason of QUARANTINE_REASONS) {
      expect(reasons, `no defect planted for ${reason}`).toContain(reason);
    }
  });

  it("plants no defect against a row that does not exist", () => {
    const estate = buildEstate();
    const known = new Set<string>([
      ...estate.mongo.members.map((m) => `mongodb:${m._id.$oid}`),
      ...estate.mongo.memberships.map((m) => `mongodb:${m._id.$oid}`),
      ...estate.wordpress.map((i) => `wordpress:${i.postId}`),
      ...estate.forms.eventSignups.map((r) => `google_forms:${r.rowId}`),
      ...estate.mollie.map((p) => `mollie:${p.id}`),
      ...estate.ledger.map((e) => `office_ledger:${e.rowId}`),
    ]);

    // The planted list is the answer key the importer is graded against. A key
    // pointing at a row nobody can find would fail the importer for missing
    // something that was never there.
    for (const defect of estate.plantedDefects) {
      if (defect.entityType === "member_phone") continue; // a field, not a row of its own
      expect(known, `${defect.id} points at nothing`).toContain(
        `${defect.sourceSystem}:${defect.sourceId}`,
      );
    }
  });

  it("gives every payment a distinct reference", () => {
    const ids = buildEstate().mollie.map((p) => p.id);
    // Derived references once collapsed to one string for every membership,
    // which made every payment look like the same payment.
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("counts by year rather than in one aggregate", () => {
    const members = emitAll(buildEstate()).find((f) => f.path.endsWith("members.jsonl"));
    const years = Object.keys(members!.counts.members!);
    // A total that matches while one year is short and another is long is the
    // failure the per-year comparison exists to catch.
    expect(years.length).toBeGreaterThan(3);
  });
});

describe("the extract manifest", () => {
  it("hashes what it actually shipped", () => {
    const files = emitAll(buildEstate());
    const manifest = buildManifest(files, { extractedAt: AT, seed: 1, plantedDefects: 0 });

    for (const [i, entry] of manifest.files.entries()) {
      expect(entry.sha256).toBe(sha256(files[i]!.contents));
      expect(entry.sha256).toMatch(/^[0-9a-f]{64}$/);
    }
  });

  it("takes its timestamp as an argument, never from the clock", () => {
    const files = emitAll(buildEstate({ seed: 3 }));
    const a = buildManifest(files, { extractedAt: AT, seed: 3, plantedDefects: 0 });
    const b = buildManifest(files, { extractedAt: AT, seed: 3, plantedDefects: 0 });
    expect(a).toEqual(b);
    expect(a.extractedAt).toBe(AT);
  });

  it("records what it could not extract", () => {
    const manifest = buildManifest(emitAll(buildEstate()), {
      extractedAt: AT,
      seed: 1,
      plantedDefects: 0,
    });
    // A silently absent collection is the most expensive kind of gap.
    expect(manifest.notExtracted.length).toBeGreaterThan(0);
    expect(manifest.synthetic).toBe(true);
    expect(manifest.notice).toMatch(/no CSA system was read/i);
  });
});

describe("the emitters", () => {
  it("quotes a comma and doubles a quote", () => {
    const csv = toCsv(["a", "b"], [['say "hi"', "one,two"]]);
    expect(csv).toBe('"a","b"\r\n"say ""hi""","one,two"\r\n');
  });

  it("writes WXR a WordPress importer would recognise", () => {
    const wxr = toWxr(buildEstate({ memberCount: 4 }).wordpress);
    expect(wxr).toContain("<wp:wxr_version>1.2</wp:wxr_version>");
    expect(wxr).toContain("<wp:post_type><![CDATA[csa_event]]></wp:post_type>");
    // The legacy event carries a date and a price and no capacity at all —
    // there is nowhere in WordPress that a capacity was ever recorded.
    expect(wxr).toContain("_event_date");
    expect(wxr).not.toContain("_event_capacity");
  });

  it("escapes a CDATA terminator instead of breaking the document", () => {
    const wxr = toWxr([
      {
        postId: 1,
        postType: "page",
        title: "Awkward ]]> title",
        slug: "awkward",
        link: "https://csa-rotterdam.nl/awkward/",
        pubDate: "2024-01-01T00:00:00Z",
        status: "publish",
        content: "<p>fine</p>",
        postmeta: {},
      },
    ]);
    expect(wxr).toContain("]]]]><![CDATA[>");
  });
});
