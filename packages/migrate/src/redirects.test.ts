import { describe, expect, it } from "vitest";

import { buildEstate } from "@csa/legacy-fixtures";

import { DOMAIN_RULES, buildRedirectMap, unmapped } from "./redirects";
import type { LoadedExtract } from "./read";

const extract = (): LoadedExtract => {
  const estate = buildEstate();
  return {
    manifest: { extractId: "t", extractedAt: "2026-08-24T09:00:00Z", files: [] },
    members: [],
    memberships: [],
    wordpress: estate.wordpress,
    actives: [],
    eventSignups: [],
    payments: [],
    ledger: [],
  };
};

describe("the redirect map", () => {
  it("answers for every legacy URL it is responsible for", () => {
    const e = extract();
    const map = buildRedirectMap(e);
    // The point of the check: a URL with no rule is not a statistic, it is a
    // page that 404s a year later with nobody watching.
    expect(unmapped(e, map)).toEqual([]);
  });

  it("gives every URL exactly one of two answers", () => {
    const map = buildRedirectMap(extract());
    for (const rule of map.rules) {
      expect([301, 410]).toContain(rule.redirectStatus);
      // A 301 has somewhere to go and a 410 must not pretend to.
      expect(rule.targetPath === null).toBe(rule.redirectStatus === 410);
      if (rule.targetPath !== null) expect(rule.targetPath.startsWith("/")).toBe(true);
      expect(rule.note.length).toBeGreaterThan(0);
    }
    expect(map.moved).toBeGreaterThan(0);
    expect(map.gone).toBeGreaterThan(0);
  });

  it("covers the live brand domains", () => {
    const hosts = DOMAIN_RULES.map((r) => new URL(r.legacyUrl).host);
    // Every one of these is reachable from CSA's own navigation today.
    expect(hosts).toContain("csa-eur.nl");
    expect(hosts).toContain("membership.csa-eur.nl");
    expect(hosts).toContain("csa-careerdays.nl");
  });

  it("does not redirect another association's domain", () => {
    const e = extract();
    const map = buildRedirectMap(e);
    const utrecht = map.rules.filter((r) => r.legacyUrl.includes("csa-utrecht.nl"));
    // The Utrecht chapter has its own board. Pointing its URLs here would be a
    // land grab dressed up as a migration.
    expect(utrecht).toEqual([]);
    // And it must not then be reported as unmapped, or the check cries wolf.
    expect(unmapped(e, map)).toEqual([]);
  });

  it("has no duplicate legacy URL", () => {
    const urls = buildRedirectMap(extract()).rules.map((r) => r.legacyUrl);
    // Two rules for one URL is one rule nobody can predict.
    expect(new Set(urls).size).toBe(urls.length);
  });
});
