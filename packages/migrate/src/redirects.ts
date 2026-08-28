/**
 * The redirect map. Migration plan §14, contract §16.
 *
 * CSA publishes under at least five brand domains today — `csa-rotterdam.nl`,
 * `csa-eur.nl`, `membership.csa-rotterdam.nl`, `csa-careerdays.nl` and
 * `csa-utrecht.nl` — and as of 2026-08-24 the main site's own logo still points
 * at the legacy `csa-eur.nl` while `membership.csa-eur.nl` 301s to
 * `membership.csa-rotterdam.nl`. Consolidation is therefore half-done in the
 * live estate, which is the strongest argument for doing the other half with a
 * map rather than by hand.
 *
 * Every legacy URL gets one of two answers and never a third. A 301 names where
 * the content went; a 410 says it is deliberately gone. What must not exist is a
 * URL nobody decided about, because that is the one that quietly 404s a year
 * later and nobody notices — so `unmapped()` is a build failure, not a report.
 */
import type { LegacySystem } from "@csa/domain";

import type { LoadedExtract } from "./read";

export interface RedirectRule {
  readonly legacyUrl: string;
  /** NULL only for a 410. */
  readonly targetPath: string | null;
  readonly redirectStatus: 301 | 410;
  readonly sourceSystem: LegacySystem;
  readonly note: string;
}

/**
 * Host-level rules, applied before anything looks at a path.
 *
 * These are the domains themselves rather than pages on them, and they are
 * written by hand because a redirect between brands is a decision about which
 * brand survives — not something to infer from an export.
 */
export const DOMAIN_RULES: readonly RedirectRule[] = [
  {
    legacyUrl: "https://csa-eur.nl/",
    targetPath: "/",
    redirectStatus: 301,
    sourceSystem: "wordpress",
    note: "the legacy brand domain; the main site's own logo still links here",
  },
  {
    legacyUrl: "https://membership.csa-eur.nl/",
    targetPath: "/membership",
    redirectStatus: 301,
    sourceSystem: "wordpress",
    note: "already 301s to membership.csa-rotterdam.nl in the live estate",
  },
  {
    legacyUrl: "https://membership.csa-rotterdam.nl/",
    targetPath: "/membership",
    redirectStatus: 301,
    sourceSystem: "wordpress",
    note: "folded into the canonical domain rather than kept as a subdomain",
  },
  {
    legacyUrl: "https://csa-careerdays.nl/",
    targetPath: "/career-days",
    redirectStatus: 301,
    sourceSystem: "wordpress",
    note: "a controlled sub-brand under the canonical domain, per plan §4.1",
  },
];

/**
 * Hosts that are NOT CSA Rotterdam's to redirect.
 *
 * The Utrecht chapter is a separate association with its own board. Pointing
 * its URLs at this platform would be a land grab dressed up as a migration.
 */
const FOREIGN_HOSTS = new Set(["csa-utrecht.nl", "www.csa-utrecht.nl"]);

/** Where a WordPress item's content lives on the new site, if anywhere. */
function targetFor(item: {
  slug: string;
  postType: string;
}): { path: string; note: string } | null {
  if (item.postType === "csa_event") {
    return { path: `/events/${item.slug}`, note: "event archive" };
  }
  switch (item.slug) {
    case "about":
      return { path: "/about", note: "about" };
    case "contact":
      return { path: "/contact", note: "contact" };
    case "csa-partners":
      return { path: "/partners", note: "partner directory" };
    case "language-courses":
      return { path: "/language-courses", note: "language courses" };
    case "general-membership":
      return { path: "/membership", note: "membership purchase" };
    default:
      // A board page for a year that has passed is genuinely gone, and saying so
      // with a 410 is kinder to a search engine and to a reader than a 301 to a
      // homepage that does not answer their question.
      return null;
  }
}

export interface RedirectMap {
  readonly rules: readonly RedirectRule[];
  readonly gone: number;
  readonly moved: number;
}

export function buildRedirectMap(extract: LoadedExtract): RedirectMap {
  const rules: RedirectRule[] = [...DOMAIN_RULES];

  for (const item of extract.wordpress) {
    let host: string;
    try {
      host = new URL(item.link).host;
    } catch {
      continue;
    }
    if (FOREIGN_HOSTS.has(host)) continue;

    const target = targetFor(item);
    rules.push(
      target
        ? {
            legacyUrl: item.link,
            targetPath: target.path,
            redirectStatus: 301,
            sourceSystem: "wordpress",
            note: target.note,
          }
        : {
            legacyUrl: item.link,
            targetPath: null,
            redirectStatus: 410,
            sourceSystem: "wordpress",
            note: "retired: superseded content with no equivalent on the new site",
          },
    );
  }

  return {
    rules,
    gone: rules.filter((r) => r.redirectStatus === 410).length,
    moved: rules.filter((r) => r.redirectStatus === 301).length,
  };
}

/**
 * Legacy URLs the map does not answer for.
 *
 * The check that matters, and the reason this returns a list rather than a
 * count: a URL with no rule is not a statistic, it is a page that will 404.
 */
export function unmapped(extract: LoadedExtract, map: RedirectMap): string[] {
  const answered = new Set(map.rules.map((r) => r.legacyUrl));
  return extract.wordpress
    .filter((item) => {
      try {
        return !FOREIGN_HOSTS.has(new URL(item.link).host);
      } catch {
        return true;
      }
    })
    .map((item) => item.link)
    .filter((url) => !answered.has(url));
}
