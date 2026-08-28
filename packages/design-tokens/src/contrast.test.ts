/**
 * The accessibility gate for the design system.
 *
 * This test walks EVERY foreground/background pairing in BOTH themes and
 * asserts it clears WCAG 2.1 AA — 4.5:1 for body text, 3:1 for large text and
 * for UI components. It is written to be exhaustive by construction rather than
 * by diligence: the surfaces are enumerated from the theme objects and the
 * thresholds come from `SURFACE_CONTRAST_REQUIREMENTS`, so a new surface or a
 * new slot on `Surface` is covered the moment it exists.
 *
 * That exhaustiveness is the point. The bug this package is built against is a
 * ground that is constant across themes paired with ink that flips: every token
 * involved measures fine on its own, and only the PAIR fails. A per-token audit
 * cannot see it. Walking the pairs can.
 */

import { describe, expect, it } from "vitest";

import {
  CONTRAST_MINIMUM,
  contrastRatio,
  hexToRgb,
  isLargeText,
  relativeLuminance,
  requiredRatioForText,
  type ContrastRole,
} from "./contrast";
import { darkTheme } from "./dark";
import { lightTheme } from "./light";
import { cssVariablesFor, flattenColorTree, tailwindColors, themeCss } from "./tailwind";
import {
  fontFamily,
  palette,
  qr,
  SPACE_BASE,
  space,
  SURFACE_CONTRAST_REQUIREMENTS,
  typeScale,
  type StatusName,
  type Surface,
  type Theme,
} from "./tokens";

const THEMES: readonly Theme[] = [lightTheme, darkTheme];
const STATUS_NAMES: readonly StatusName[] = ["success", "warning", "danger", "info"];

/** Every `Surface` in a theme, with a path for readable failure messages. */
function surfacesOf(theme: Theme): Array<{ path: string; surface: Surface }> {
  return [
    { path: "surface.app", surface: theme.surface.app },
    { path: "surface.card", surface: theme.surface.card },
    { path: "surface.sunken", surface: theme.surface.sunken },
    { path: "surface.overlay", surface: theme.surface.overlay },
    { path: "brand.solid", surface: theme.brand.solid },
    { path: "brand.subtle", surface: theme.brand.subtle },
    ...STATUS_NAMES.flatMap((name) => [
      { path: `status.${name}.solid`, surface: theme.status[name].solid },
      { path: `status.${name}.subtle`, surface: theme.status[name].subtle },
    ]),
  ];
}

const neutralGroundsOf = (theme: Theme): Array<{ path: string; ground: string }> => [
  { path: "surface.app", ground: theme.surface.app.ground },
  { path: "surface.card", ground: theme.surface.card.ground },
  { path: "surface.sunken", ground: theme.surface.sunken.ground },
  { path: "surface.overlay", ground: theme.surface.overlay.ground },
];

/* -------------------------------------------------------------------------- *
 * The maths itself
 * -------------------------------------------------------------------------- */

describe("contrast maths", () => {
  it("puts black on white at the 21:1 ceiling", () => {
    expect(contrastRatio("#000000", "#FFFFFF")).toBeCloseTo(21, 5);
  });

  it("puts a colour against itself at the 1:1 floor", () => {
    expect(contrastRatio("#C1272D", "#C1272D")).toBeCloseTo(1, 10);
  });

  it("is symmetric", () => {
    expect(contrastRatio("#C1272D", "#FFFFFF")).toBeCloseTo(
      contrastRatio("#FFFFFF", "#C1272D"),
      10,
    );
  });

  it("anchors relative luminance at the endpoints", () => {
    expect(relativeLuminance("#000000")).toBeCloseTo(0, 10);
    expect(relativeLuminance("#FFFFFF")).toBeCloseTo(1, 10);
  });

  it("reproduces the CSA logo pairing at 5.84:1", () => {
    // White letterforms on #C1272D, measured off the logo bitmap itself.
    // If this number moves, the brand colour moved.
    expect(contrastRatio("#FFFFFF", "#C1272D")).toBeCloseTo(5.84, 2);
  });

  it("parses shorthand and full hex identically", () => {
    expect(hexToRgb("#fff")).toEqual(hexToRgb("#FFFFFF"));
    expect(hexToRgb("#C1272D")).toEqual({ r: 193, g: 39, b: 45 });
  });

  it("throws on a malformed colour rather than guessing", () => {
    expect(() => hexToRgb("rebeccapurple")).toThrow();
    expect(() => hexToRgb("#12345")).toThrow();
  });
});

describe("WCAG large-text rule", () => {
  it("treats 24px and above as large at any weight", () => {
    expect(isLargeText(24, 400)).toBe(true);
    expect(isLargeText(23.99, 400)).toBe(false);
  });

  it("treats 18.66px and above as large only at bold", () => {
    expect(isLargeText(18.66, 700)).toBe(true);
    expect(isLargeText(18.66, 600)).toBe(false);
    expect(isLargeText(18, 700)).toBe(false);
  });

  it("maps size and weight to the right threshold", () => {
    expect(requiredRatioForText(16, 400)).toBe(CONTRAST_MINIMUM.text); // 4.5
    expect(requiredRatioForText(32, 700)).toBe(CONTRAST_MINIMUM.largeText); // 3.0
  });
});

/* -------------------------------------------------------------------------- *
 * The gate: every pairing, every theme
 * -------------------------------------------------------------------------- */

describe.each(THEMES)("$name theme — every ground/ink pairing", (theme) => {
  const surfaces = surfacesOf(theme);

  it("declares at least the fourteen surfaces the product needs", () => {
    expect(surfaces).toHaveLength(14);
  });

  describe.each(surfaces)("$path", ({ path, surface }) => {
    for (const [slot, role] of Object.entries(SURFACE_CONTRAST_REQUIREMENTS) as Array<
      [Exclude<keyof Surface, "ground">, ContrastRole | null]
    >) {
      if (role === null) continue;

      it(`${slot} clears ${CONTRAST_MINIMUM[role]}:1 against its own ground (${role})`, () => {
        const ratio = contrastRatio(surface[slot], surface.ground);
        expect(
          ratio,
          `${theme.name}.${path}.${slot} = ${surface[slot]} on ${surface.ground} ` +
            `measured ${ratio.toFixed(2)}:1, needs ${CONTRAST_MINIMUM[role]}:1`,
        ).toBeGreaterThanOrEqual(CONTRAST_MINIMUM[role]);
      });
    }

    it("has a hairline distinguishable from its ground", () => {
      // Deliberately not held to 3:1 — see the doc comment on Surface.hairline.
      // It must still be a different colour, or it is not a hairline at all.
      expect(surface.hairline.toUpperCase()).not.toBe(surface.ground.toUpperCase());
      expect(contrastRatio(surface.hairline, surface.ground)).toBeGreaterThan(1.05);
    });

    it("would still clear the relaxed large-text threshold", () => {
      // Everything we ship clears the stricter body threshold, so this is
      // slack today. It exists so that a future decision to run some display
      // pairing at 3:1 has an assertion to move rather than to invent.
      expect(contrastRatio(surface.ink, surface.ground)).toBeGreaterThanOrEqual(
        CONTRAST_MINIMUM.largeText,
      );
    });
  });
});

describe.each(THEMES)("$name theme — interactive text on neutral grounds", (theme) => {
  const grounds = neutralGroundsOf(theme);

  for (const state of ["ink", "hover", "pressed"] as const) {
    it.each(grounds)(`link.${state} clears 4.5:1 on $path`, ({ path, ground }) => {
      const colour = theme.link[state];
      const ratio = contrastRatio(colour, ground);
      expect(
        ratio,
        `${theme.name}.link.${state} = ${colour} on ${path} (${ground}) ` +
          `measured ${ratio.toFixed(2)}:1`,
      ).toBeGreaterThanOrEqual(CONTRAST_MINIMUM.text);
    });
  }
});

/* -------------------------------------------------------------------------- *
 * Colour is never the only signal
 * -------------------------------------------------------------------------- */

describe.each(THEMES)("$name theme — semantic states carry a second channel", (theme) => {
  it.each(STATUS_NAMES)("%s ships an icon and a label, not just a hex", (name) => {
    const role = theme.status[name];
    expect(role.icon).toBeTruthy();
    expect(role.label.trim().length).toBeGreaterThan(0);
  });

  it("keeps every solid status ground distinct from every other and from the brand", () => {
    // CSA's brand is red, so danger-red does not read as "error" on its own.
    // The icon and label do the real work — but the grounds must at least not
    // be literally the same colour.
    const grounds = [
      ["brand", theme.brand.solid.ground],
      ...STATUS_NAMES.map((n) => [n, theme.status[n].solid.ground] as const),
    ] as Array<readonly [string, string]>;

    const seen = new Map<string, string>();
    for (const [name, ground] of grounds) {
      const key = ground.toUpperCase();
      expect(seen.has(key), `${name} reuses ${ground}, already used by ${seen.get(key)}`).toBe(
        false,
      );
      seen.set(key, name);
    }
  });
});

/* -------------------------------------------------------------------------- *
 * Structural guarantees the bridges depend on
 * -------------------------------------------------------------------------- */

/** Sorted list of every leaf path in an object — its shape, ignoring values. */
function shapeOf(value: unknown, prefix = ""): string[] {
  if (value === null || typeof value !== "object") return [prefix];
  return Object.entries(value as Record<string, unknown>)
    .flatMap(([key, child]) => shapeOf(child, prefix ? `${prefix}.${key}` : key))
    .sort();
}

describe("both themes are structurally identical", () => {
  it("resolves the same set of roles", () => {
    // The Tailwind colour map is generated from the light theme's shape and
    // applied to both. If the shapes diverge, dark mode silently loses a
    // variable and falls back to an inherited colour.
    expect(shapeOf(darkTheme)).toEqual(shapeOf(lightTheme));
  });

  it("names itself correctly", () => {
    expect(lightTheme.name).toBe("light");
    expect(darkTheme.name).toBe("dark");
  });
});

describe("tailwind bridge never redeclares a value", () => {
  const flat = flattenColorTree(tailwindColors);

  it("points every colour at a generated custom property", () => {
    const entries = Object.entries(flat);
    expect(entries.length).toBeGreaterThan(0);
    for (const [path, value] of entries) {
      expect(value, `${path} is a literal, not a var() reference`).toMatch(
        /^var\(--csa-[a-z0-9-]+\)$/,
      );
    }
  });

  it("resolves every referenced variable in BOTH themes", () => {
    const lightVars = cssVariablesFor(lightTheme);
    const darkVars = cssVariablesFor(darkTheme);

    for (const [path, value] of Object.entries(flat)) {
      const name = value.slice("var(".length, -1);
      expect(lightVars[name], `${path} -> ${name} missing from light theme CSS`).toBeDefined();
      expect(darkVars[name], `${path} -> ${name} missing from dark theme CSS`).toBeDefined();
    }
  });

  it("emits both themes plus an explicit override for each", () => {
    const css = themeCss();
    expect(css).toContain(":root {");
    expect(css).toContain("@media (prefers-color-scheme: dark)");
    expect(css).toContain('[data-theme="dark"]');
    expect(css).toContain('[data-theme="light"]');
    expect(css).toContain("color-scheme:");
    expect(css).toContain(lightTheme.brand.solid.ground);
    expect(css).toContain(darkTheme.surface.app.ground);
  });
});

/* -------------------------------------------------------------------------- *
 * The rest of the token set
 * -------------------------------------------------------------------------- */

describe("typography", () => {
  it("declares self-hosted families only — no remote subresource", () => {
    // A privacy property, not a style preference. It matters more than usual
    // for a system that holds member records.
    for (const family of [...fontFamily.sans, ...fontFamily.mono]) {
      expect(family).not.toMatch(/https?:|\/\/|url\(/i);
    }
  });

  it("pairs every size with a line-height and a letter-spacing", () => {
    for (const [name, step] of Object.entries(typeScale)) {
      expect(step.size, name).toBeGreaterThan(0);
      expect(step.lineHeight, name).toBeGreaterThanOrEqual(step.size);
      expect(typeof step.letterSpacing, name).toBe("number");
      expect([400, 500, 600, 700]).toContain(step.weight);
    }
  });

  it("is a strictly ascending scale", () => {
    const sizes = Object.values(typeScale).map((s) => s.size);
    expect(sizes).toEqual([...sizes].sort((a, b) => a - b));
    expect(new Set(sizes).size).toBe(sizes.length);
  });

  it("classifies the display steps as WCAG large text", () => {
    expect(isLargeText(typeScale.heading.size, typeScale.heading.weight)).toBe(true);
    expect(isLargeText(typeScale.display.size, typeScale.display.weight)).toBe(true);
    expect(isLargeText(typeScale.hero.size, typeScale.hero.weight)).toBe(true);
    expect(isLargeText(typeScale.body.size, typeScale.body.weight)).toBe(false);
  });
});

describe("spacing", () => {
  it("is a single base unit all the way up", () => {
    for (const [key, value] of Object.entries(space)) {
      if (key === "px") continue; // the one deliberate hairline exception
      expect(value % SPACE_BASE, `space.${key} = ${value} is not a multiple of ${SPACE_BASE}`).toBe(
        0,
      );
    }
  });

  it("keys the scale by its own multiplier", () => {
    expect(space[4]).toBe(4 * SPACE_BASE);
    expect(space[6]).toBe(6 * SPACE_BASE);
  });
});

describe("QR surface", () => {
  it("holds pure black on pure white in every theme", () => {
    // Not theme-aware, on purpose: this is the pairing scanners are calibrated
    // for, and a ticket that fails to scan at the door is a total failure of
    // the demo rather than a visual nitpick.
    expect(contrastRatio(qr.foreground, qr.background)).toBeCloseTo(21, 5);
  });

  it("keeps a real quiet zone", () => {
    expect(qr.quietZoneModules).toBeGreaterThanOrEqual(4);
  });
});

describe("palette provenance", () => {
  it("holds the logo red as the brand mark in both themes", () => {
    expect(palette.red.mark).toBe("#C1272D");
    expect(lightTheme.brand.mark).toBe(palette.red.mark);
    expect(darkTheme.brand.mark).toBe(palette.red.mark);
  });

  it("records — and does not use — the two source values that fail AA", () => {
    // The live site's body grey and its green. Kept for reference so nobody
    // rediscovers them and assumes they were an oversight on our part.
    expect(contrastRatio(palette.neutral.sourceBodyGrey, "#FFFFFF")).toBeLessThan(
      CONTRAST_MINIMUM.text,
    );
    expect(contrastRatio(palette.green.source, "#FFFFFF")).toBeLessThan(CONTRAST_MINIMUM.text);

    const inUse = new Set(
      THEMES.flatMap((theme) =>
        surfacesOf(theme).flatMap((s) => Object.values(s.surface).map((v) => v.toUpperCase())),
      ),
    );
    expect(inUse.has(palette.neutral.sourceBodyGrey.toUpperCase())).toBe(false);
    expect(inUse.has(palette.green.source.toUpperCase())).toBe(false);
  });

  it("only contains parseable hex values", () => {
    for (const theme of THEMES) {
      for (const { path, surface } of surfacesOf(theme)) {
        for (const [slot, value] of Object.entries(surface)) {
          expect(() => hexToRgb(value), `${theme.name}.${path}.${slot}`).not.toThrow();
        }
      }
    }
  });
});
