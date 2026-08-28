/**
 * CSA Digital Hub — material tokens.
 *
 * The runtime-neutral source of visual materials. Plain TypeScript objects: no
 * CSS, no `StyleSheet`, no Tailwind classes, no React import. Public web and
 * operations web consume these through `./tailwind`; the Expo app imports them
 * through `./native`. Motion vocabulary lives only in `@csa/motion`.
 *
 * ---------------------------------------------------------------------------
 * PROVENANCE — read before changing a colour.
 * ---------------------------------------------------------------------------
 * Every colour below is tagged. The tags are load-bearing: they are the
 * difference between a value CSA has already committed to in public and a value
 * this repo picked. Keep them accurate.
 *
 *   [SOURCE]      Read from the public https://csa-rotterdam.nl/ homepage on
 *                 2026-08-20, as an ordinary visitor (one page load, no login,
 *                 no crawl). Two independent places:
 *                   (a) the site's own Elementor global palette, declared as
 *                       CSS custom properties in the served HTML
 *                       (`--e-global-color-primary` and friends), and
 *                   (b) the CSA logo bitmap,
 *                       /wp-content/uploads/2024/09/CSA-logo-rounded.png,
 *                       decoded pixel-by-pixel: 53.2% of its opaque pixels are
 *                       #C1272D and 46.4% are #FFFFFF. There is no third colour
 *                       above 0.2%.
 *
 *   [DERIVED]     Computed from a [SOURCE] value because the source value does
 *                 not clear WCAG AA at the pairing we need. The hue is kept;
 *                 the lightness is moved until the pair passes. Each one says
 *                 which source value it came from and why it had to move.
 *
 *   [PROVISIONAL] No source basis. This repo chose it. It is a considered
 *                 default, not a decision — the board has not seen it.
 *                 EVERYTHING in the dark theme is [PROVISIONAL] by definition:
 *                 csa-rotterdam.nl has no dark mode, so there was nothing to
 *                 read.
 *
 * What is genuinely CONFIRMED: the brand is red, that red is #C1272D, it is
 * used as a ground with white on top, the deeper reds (#A5302A, #981A20,
 * #721418 …) are the site's own text-bearing red grounds, gold (#E9C450,
 * #FFDD74) is the secondary brand colour, and the typeface is Poppins.
 *
 * What is NOT confirmed and needs board sign-off: the whole dark theme; the
 * assignment of colours to semantic roles (the live site is a marketing site
 * and has no status system); the info blue; the type scale steps; the spacing
 * base; the radii; and the danger-vs-brand collision noted on `status.danger`.
 *
 * ---------------------------------------------------------------------------
 * TWO FINDINGS FROM THE SOURCE THAT WE DELIBERATELY DID NOT INHERIT
 * ---------------------------------------------------------------------------
 * 1. The live site's body text colour is #7A7A7A, which is 4.29:1 on white and
 *    4.08:1 on its own page background. Both fail WCAG AA (4.5:1). We use a
 *    darker neutral instead — see `palette.neutral.inkMuted`.
 * 2. The live site's green #23A455 is 3.22:1 against white in both directions,
 *    so it works neither as a solid ground under white text nor as text on
 *    white. We darkened it — see `palette.green`.
 * Neither is a criticism to repeat outside this file; both are simply values we
 * could not copy.
 */

import type { Hex } from "./contrast";

export type { Hex } from "./contrast";

/* ========================================================================== *
 * 1. Surfaces — the ground/ink pairing model
 * ========================================================================== */

/**
 * A ground is never a bare hex. It is a `Surface`: a background together with
 * everything that has to sit legibly on top of it.
 *
 * This is the shape of the bug the UI standard warns about. A ground that stays
 * constant across light and dark, paired with ink that flips, measures fine in
 * one theme and vanishes in the other — and a per-token audit never catches it,
 * because each token is individually defensible. The fix is structural, not
 * procedural: there is no exported "background colour" token anywhere in this
 * package. You cannot reach a ground without its ink coming with it, and both
 * themes must fill in the same six slots, so the test can walk every pair in
 * both themes and no pairing can be silently omitted.
 *
 * `status.warning` is the clearest illustration: its gold ground is identical
 * in light and dark, and its ink is dark in BOTH themes. That is correct, and
 * it is only obviously correct because the ink is declared alongside the ground
 * rather than inherited from the theme's text colour.
 */
export interface Surface {
  /** The background this surface paints. */
  readonly ground: Hex;
  /** Body-size text on `ground`. Must clear 4.5:1. */
  readonly ink: Hex;
  /** Secondary text on `ground`. Held to 4.5:1 too — it is still body-size text. */
  readonly inkMuted: Hex;
  /**
   * Decorative hairline: section rules, table row separators, card edges that
   * are not the sole indication of a control. Deliberately NOT held to 3:1 —
   * WCAG 1.4.11 covers controls and meaningful graphics, not ornament, and
   * forcing a 3:1 divider produces the heavy-boxed look the standard warns
   * against. It must still differ from `ground`, which the test asserts.
   */
  readonly hairline: Hex;
  /**
   * A boundary that IS the control: input borders, unfilled button outlines,
   * checkbox edges. Must clear 3:1 (WCAG 1.4.11).
   */
  readonly outline: Hex;
  /**
   * The focus indicator for this surface specifically. Must clear 3:1.
   *
   * Web uses one global `:focus-visible` rule; on a coloured ground the subtree
   * re-points at that ground's own `focusRing`. That is the same ground/ink
   * lesson applied to focus, and it is why the ring is a per-surface value and
   * not a single global colour: a brand-red ring is perfect on white and
   * invisible on the brand-red button.
   */
  readonly focusRing: Hex;
}

/**
 * Which WCAG threshold each `Surface` slot must clear against its own `ground`.
 * The contrast test is driven off this map rather than a hand-written list, so
 * adding a slot to `Surface` without deciding its threshold is a type error
 * rather than an untested value.
 */
export const SURFACE_CONTRAST_REQUIREMENTS: Readonly<
  Record<Exclude<keyof Surface, "ground">, "text" | "ui" | null>
> = {
  ink: "text",
  inkMuted: "text",
  hairline: null, // decorative — see the doc comment on Surface.hairline
  outline: "ui",
  focusRing: "ui",
};

/* ========================================================================== *
 * 2. Semantic status — colour is never the only signal
 * ========================================================================== */

export type StatusName = "success" | "warning" | "danger" | "info";

/**
 * Icon names are Lucide names. Lucide ships `lucide-react` and
 * `lucide-react-native` with an identical name set, which is why a shared
 * string token is portable across both runtimes. The concrete library binding
 * is an app-level decision; this package only names the glyph.
 */
export type StatusIconName = "CircleCheck" | "TriangleAlert" | "CircleX" | "Info";

/**
 * A status role is a colour pair PLUS the non-colour signal that must accompany
 * it. `icon` and `label` are required fields, so a status cannot be added to a
 * theme as a hex alone — the compiler asks for the second channel.
 *
 * This matters more than usual for CSA: the brand itself is red, so red carries
 * no automatic "something is wrong" meaning here. See the note on
 * `STATUS_SIGNAL.danger`.
 */
export interface StatusRole {
  readonly solid: Surface;
  readonly subtle: Surface;
  readonly icon: StatusIconName;
  /** Default English label. Apps may localise; they may not drop it. */
  readonly label: string;
}

/**
 * The theme-invariant half of each status role. Declared once here and spread
 * into both themes, because an icon does not change when the lights go out.
 */
export const STATUS_SIGNAL: Readonly<
  Record<StatusName, { readonly icon: StatusIconName; readonly label: string }>
> = {
  success: { icon: "CircleCheck", label: "Success" },
  warning: { icon: "TriangleAlert", label: "Warning" },
  /**
   * OPEN DECISION FOR THE BOARD — danger vs brand.
   *
   * CSA's brand colour is red. A red danger state therefore does not read as
   * "error" on its own the way it would for a blue-branded product; it reads as
   * brand chrome. We separate them by lightness (danger is a deeper red than
   * the brand in light mode and a lighter one in dark mode) but that separation
   * is weak on its own, which is exactly why `icon` and `label` are required
   * fields rather than a convention.
   *
   * The one surface where this must not be merely adequate is the check-in
   * scanner. There the result is a full-bleed ground with a large label and an
   * icon, and success-green against danger-red is unmistakable at arm's length
   * regardless of what colour the surrounding chrome is. Do not reduce a scan
   * result to a small coloured chip.
   */
  danger: { icon: "CircleX", label: "Error" },
  info: { icon: "Info", label: "Information" },
};

/* ========================================================================== *
 * 3. Palette — the raw values, tagged with provenance
 * ========================================================================== */

/**
 * Raw values only. Components never import from here — they read a resolved
 * `Theme`. This exists so the two theme files can share literals and so the
 * provenance of each literal lives in exactly one place.
 */
export const palette = {
  /**
   * The brand red family.
   *
   * `mark` is the logo's own red, measured off the logo bitmap. It and white
   * are the only two colours in the mark. Everything else in this group is the
   * site's own Elementor palette.
   */
  red: {
    /** [SOURCE] logo bitmap, 53.2% of opaque pixels. THE brand colour. */
    mark: "#C1272D" as Hex,
    /** [SOURCE] `--e-global-color-primary`. Visually identical to `mark`; independent corroboration. */
    primary: "#BF2B2B" as Hex,
    /** [SOURCE] `--e-global-color-accent`. A hotter orange-red; only 4.82:1 under white, so not used as a text ground. */
    accent: "#E11B00" as Hex,
    /** [SOURCE] `--e-global-color-1df4b34`; the site uses this as a section background behind white text. */
    deep: "#A5302A" as Hex,
    /** [SOURCE] `--e-global-color-cac2a6d`. */
    deeper: "#981A20" as Hex,
    /** [SOURCE] `--e-global-color-c9612c2`. */
    darkest: "#721418" as Hex,
    /** [SOURCE] `--e-global-color-7eb40ef`. */
    ink: "#4C0D10" as Hex,
    /** [SOURCE] `--e-global-color-9838346`. */
    mid: "#CB4D53" as Hex,
    /** [SOURCE] `--e-global-color-a3d933e`. */
    tint: "#E4A6A9" as Hex,
    /** [SOURCE] `--e-global-color-7f60622`. */
    tintPale: "#F2D3D4" as Hex,
    /** [SOURCE] `--e-global-color-79b1b2c`; the site's pink wash background. */
    wash: "#FFF1F2" as Hex,
  },

  /** [SOURCE] The gold pair from the site palette — CSA's secondary brand colour. */
  gold: {
    /** [SOURCE] `--e-global-color-77dd1bb`. */
    base: "#E9C450" as Hex,
    /** [SOURCE] `--e-global-color-ad8f190`. */
    light: "#FFDD74" as Hex,
  },

  /**
   * Green.
   *
   * [SOURCE] `--e-global-color-684c887` is #23A455 — but it measures 3.22:1
   * against white in both directions, so it can be neither a solid ground under
   * white text nor text on a white card. Both usable values below are the
   * source hue darkened until the pairing passes.
   */
  green: {
    /** [SOURCE] the site's green, kept for reference. Do not use as a text pairing. */
    source: "#23A455" as Hex,
    /** [DERIVED] from #23A455, darkened until white ink clears AA (6.57:1). */
    solid: "#176B37" as Hex,
    /** [PROVISIONAL] light-theme wash under `solid`-family ink. */
    wash: "#E9F6EE" as Hex,
    /** [PROVISIONAL] dark-theme ground; light enough to read as "go" on a near-black UI. */
    bright: "#4CB877" as Hex,
  },

  /**
   * Blue. THE WEAKEST PROVENANCE IN THIS FILE.
   *
   * The site palette contains only pale blue-greys (#CADBE0, #E0E4E5) used as
   * background tints — nothing usable as an informational colour. `solid` below
   * keeps their hue (~197 deg) and takes it to a usable lightness, but CSA has
   * never published a blue. If the board wants informational states in another
   * colour, this is the value to change and nothing else depends on it.
   */
  blue: {
    /** [SOURCE] `--e-global-color-f888d8d`, a pale background tint. */
    sourcePale: "#CADBE0" as Hex,
    /** [PROVISIONAL] hue-matched to the pale source, darkened to carry white ink. */
    solid: "#1D6B85" as Hex,
    /** [PROVISIONAL] */
    wash: "#E4EDF0" as Hex,
    /** [PROVISIONAL] dark-theme ground. */
    bright: "#5FB3CE" as Hex,
  },

  /**
   * Neutrals.
   *
   * The light greys are the site's own; note they are very slightly cool, which
   * is a real characteristic of the source and not an accident to "fix".
   * The ink values are [DERIVED] because the site's own #7A7A7A body grey fails
   * AA (4.29:1 on white).
   */
  neutral: {
    /** [SOURCE] logo + `--e-global-color-8908ffb`. */
    white: "#FFFFFF" as Hex,
    /** [SOURCE] `--e-global-color-acd58d3`; the site's page background. */
    page: "#F9F9FB" as Hex,
    /** [SOURCE] `--e-global-color-7466be9`. */
    sunken: "#F4F4F4" as Hex,
    /** [SOURCE] `--e-global-color-cb7a3f3`. */
    line: "#ECECEC" as Hex,
    /** [SOURCE] `--e-global-color-e4230d3`. */
    lineStrong: "#E0E4E5" as Hex,
    /** [SOURCE] `--e-global-color-text`. FAILS AA at 4.29:1 on white — reference only, never render text in it. */
    sourceBodyGrey: "#7A7A7A" as Hex,
    /** [PROVISIONAL] near-black with a faint warm cast so it sits with the red rather than against it. */
    ink: "#241B1C" as Hex,
    /** [DERIVED] the replacement for #7A7A7A; darkened until it clears AA on the darkest light ground (6.02:1). */
    inkMuted: "#655A5C" as Hex,
    /** [PROVISIONAL] control boundary on light grounds; 3.51:1 at worst. */
    outline: "#8A7F81" as Hex,
  },

  /** [PROVISIONAL] Entire dark neutral ramp. The source has no dark mode. */
  dark: {
    app: "#141011" as Hex,
    card: "#1D1819" as Hex,
    sunken: "#0D0A0B" as Hex,
    overlay: "#251F21" as Hex,
    ink: "#F6F1F2" as Hex,
    inkMuted: "#A09496" as Hex,
    outline: "#7A7072" as Hex,
  },
} as const;

/**
 * Non-text brand accents for expressive public surfaces.
 *
 * These are semantic decorative signals, not status colours and not grounds
 * for arbitrary copy. Both values are [SOURCE] colours from CSA's public site;
 * promoting them here prevents public components from reaching into the raw
 * provenance palette or misusing the warning status role for decoration.
 */
export const brandAccent = {
  warm: palette.gold.base,
  warmLight: palette.gold.light,
} as const;

/* ========================================================================== *
 * 4. Typography
 * ========================================================================== */

/**
 * Font families.
 *
 * NO REMOTE FONTS. This package declares family NAMES only; each app ships the
 * font files itself (`.woff2` for the portal, bundled `.ttf`/`.otf` for Expo).
 * There is no URL anywhere in this package and there must never be one — the
 * contrast test asserts that too. This is a privacy property, not a style
 * preference, and it matters more than usual for a system that holds member
 * records: a Google Fonts link leaks every page view to a third party.
 *
 * Note for whoever wires this up: csa-rotterdam.nl currently loads Poppins and
 * Open Sans from fonts.googleapis.com. We take the typeface and leave the
 * delivery mechanism behind.
 *
 * Poppins is SIL Open Font License 1.1, so self-hosting is permitted. So is
 * JetBrains Mono.
 */
export const fontFamily = {
  /**
   * [SOURCE] Poppins is the site's global typeface — all four Elementor global
   * typography slots (primary, secondary, text, accent) resolve to it.
   */
  sans: ["Poppins", "system-ui", "-apple-system", "Segoe UI", "Roboto", "sans-serif"] as const,

  /**
   * [PROVISIONAL] Engineering choice, not a brand decision.
   *
   * Ticket codes are 10 characters of Crockford base32 and get read aloud and
   * typed in by hand at a venue door. That needs a face that disambiguates
   * 0/O and 1/I/l, which Poppins — a geometric sans — does not. Also the right
   * family for any column of numbers that must line up, because RN's
   * `fontVariant: ['tabular-nums']` is unreliable on Android.
   */
  mono: [
    "JetBrains Mono",
    "ui-monospace",
    "SFMono-Regular",
    "Menlo",
    "Consolas",
    "monospace",
  ] as const,
} as const;

/**
 * OPEN QUESTION for the board, recorded rather than silently resolved: Poppins
 * is a display-leaning geometric sans and is not ideal at 12–13px in a dense
 * committee table. The only other family the source site loads is Open Sans,
 * and it appears in exactly one button rule — too thin an evidence base to
 * promote it to the text face for the whole committee register. If the dense
 * tables read poorly in review, this is the decision to reopen.
 */
export const OPEN_TYPOGRAPHY_QUESTION =
  "Poppins at small sizes in the committee register may need a companion text face.";

export type FontWeight = 400 | 500 | 600 | 700;

/**
 * One step of the type scale.
 *
 * The size carries its line-height and letter-spacing. That is the whole point:
 * writing `text-2xl leading-tight tracking-tight` at a call site means fighting
 * a scale that was already tuned. Consume a step whole.
 *
 * Units: `size` and `lineHeight` are CSS px on web and density-independent
 * points in React Native — the same number in both, which is why they are bare
 * numbers here. `letterSpacing` is in **em**, because that is the only unit
 * that survives being scaled; each bridge converts (web to `em`, native to
 * absolute points via `letterSpacing * size`).
 */
export interface TypeStep {
  readonly size: number;
  readonly lineHeight: number;
  /** In em. Negative tightens. */
  readonly letterSpacing: number;
  readonly weight: FontWeight;
}

/**
 * [PROVISIONAL] Eight steps. The source is a WordPress marketing site whose
 * scale does not transfer to either an app or a dense operational table, so
 * nothing here is derived — but it is a single coherent scale rather than a
 * grab bag, and the negative tracking at the top is a real requirement of
 * Poppins' geometric forms at display sizes.
 */
export const typeScale = {
  /** Table meta, field labels, badges. Positive tracking: geometric sans needs air when small. */
  caption: { size: 12, lineHeight: 16, letterSpacing: 0.01, weight: 500 },
  /** Dense committee tables, secondary body. */
  bodySm: { size: 14, lineHeight: 20, letterSpacing: 0.005, weight: 400 },
  /** Default body. */
  body: { size: 16, lineHeight: 24, letterSpacing: 0, weight: 400 },
  /** Lead paragraph in the member app. */
  bodyLg: { size: 18, lineHeight: 28, letterSpacing: -0.005, weight: 400 },
  /** Card titles, section headers. */
  title: { size: 20, lineHeight: 28, letterSpacing: -0.01, weight: 600 },
  /** Screen and page headings. */
  heading: { size: 24, lineHeight: 32, letterSpacing: -0.015, weight: 600 },
  /** Event title on a detail screen; the capacity number on the committee dashboard. */
  display: { size: 32, lineHeight: 40, letterSpacing: -0.02, weight: 700 },
  /**
   * The scanner result, and nothing else so far. Under a queue at a venue door
   * the outcome has to be readable at arm's length without being focused on.
   */
  hero: { size: 48, lineHeight: 52, letterSpacing: -0.025, weight: 700 },
} as const satisfies Readonly<Record<string, TypeStep>>;

export type TypeStepName = keyof typeof typeScale;

export const fontWeight = {
  regular: 400,
  medium: 500,
  semibold: 600,
  bold: 700,
} as const satisfies Readonly<Record<string, FontWeight>>;

/**
 * Numbers that get compared against other numbers — capacity counts, attendance
 * totals, prices, countdowns — are tabular. On web this is
 * `font-variant-numeric: tabular-nums`. In React Native it is
 * `fontVariant: ['tabular-nums']`, which is reliable on iOS and not on Android;
 * for a column that must actually line up on Android, use `fontFamily.mono`.
 */
export const NUMERIC_TABULAR = "tabular-nums" as const;

/* ========================================================================== *
 * 5. Space, size, radius
 * ========================================================================== */

/**
 * One base unit. Everything spatial is a multiple of it — the key IS the
 * multiplier, so `space[4]` is 4 x 4 = 16px. That also makes the scale
 * numerically identical to Tailwind's default spacing, so `p-4` means the same
 * thing in the portal as `space[4]` does in the app.
 *
 * There is deliberately no `p-[13px]` escape hatch: if a value is not on this
 * scale, the layout is wrong, not the scale.
 */
export const SPACE_BASE = 4;

export const space = {
  0: 0,
  px: 1,
  1: 4,
  2: 8,
  3: 12,
  4: 16,
  5: 20,
  6: 24,
  7: 28,
  8: 32,
  10: 40,
  12: 48,
  14: 56,
  16: 64,
  20: 80,
  24: 96,
} as const;

export type SpaceKey = keyof typeof space;

/**
 * [PROVISIONAL] One radius per role. Three is plenty; `rounded-xl` scattered
 * through a tree is drift, and the Tailwind bridge deliberately REPLACES
 * Tailwind's radius scale rather than extending it so the drift is not
 * available in the first place.
 *
 * Data point rather than a derivation: the CSA logo's own rounded square has a
 * corner radius of ~120px on a 2160px side — 5.6% of its side. That ratio does
 * not transfer (5.6% of a 40px button is 2.2px, which reads as a square), so
 * these are chosen values, not measured ones.
 */
export const radius = {
  none: 0,
  /** Buttons, inputs, chips, segmented controls. */
  control: 8,
  /** Cards, sheets, modals, list containers. */
  card: 14,
  /** Pills and avatars only. The pill is the button idiom — a page of
   *  pill-shaped non-buttons reads as a toy. */
  pill: 9999,
} as const;

/**
 * [PROVISIONAL] Sizes that are floors rather than preferences.
 *
 * `touchTarget` is a hard accessibility floor: 44pt on iOS, 48dp on Android.
 * When the artwork is smaller than the floor, the gap is closed with `hitSlop`
 * (see `hitSlopFor` in `./native`) — never by shrinking the target.
 *
 * `control.sm` is BELOW the touch floor on purpose. It exists for the committee
 * register, which is pointer-driven and dense. It must not appear in
 * `apps/mobile`.
 */
export const size = {
  touchTarget: { ios: 44, android: 48, min: 48 },
  control: { sm: 32, md: 40, lg: 48 },
  icon: { sm: 16, md: 20, lg: 24 },
} as const;

/* ========================================================================== *
 * 6. Elevation
 * ========================================================================== */

/**
 * Elevation is meaning, not decoration. Three levels, and the default is
 * `flat` — a hairline border, no shadow at all.
 *
 * Stored as primitives rather than as a `box-shadow` string or an RN style
 * object, because the two runtimes model shadows incompatibly: web takes one
 * declaration, iOS takes four properties, and Android takes a single `elevation`
 * number that ignores the rest. Each bridge assembles from these.
 */
export interface Elevation {
  /** Vertical offset. There is no horizontal offset; light comes from above. */
  readonly y: number;
  readonly blur: number;
  readonly spread: number;
  readonly color: Hex;
  readonly opacity: number;
  /** Android's `elevation`, which is not derivable from the others. */
  readonly androidElevation: number;
  /** Whether this level carries a hairline border instead of / as well as a shadow. */
  readonly usesHairline: boolean;
}

export const elevation = {
  /** The default for cards, panels and table rows. A border, not a shadow. */
  flat: {
    y: 0,
    blur: 0,
    spread: 0,
    color: "#000000" as Hex,
    opacity: 0,
    androidElevation: 0,
    usesHairline: true,
  },
  /** Something that has genuinely lifted: a dragged row, an open dropdown trigger. */
  raised: {
    y: 1,
    blur: 3,
    spread: 0,
    color: "#000000" as Hex,
    opacity: 0.1,
    androidElevation: 2,
    usesHairline: true,
  },
  /** Modals, sheets, popovers — things that sit above the page and take focus. */
  overlay: {
    y: 8,
    blur: 24,
    spread: -4,
    color: "#000000" as Hex,
    opacity: 0.18,
    androidElevation: 12,
    usesHairline: false,
  },
} as const satisfies Readonly<Record<string, Elevation>>;

export type ElevationName = keyof typeof elevation;

/* ========================================================================== *
 * 7. Opacity
 * ========================================================================== */

export const opacity = {
  /**
   * Disabled is reduced opacity PLUS non-interactivity. Never a colour change
   * alone — a disabled control that only changes colour is indistinguishable
   * from a differently-styled enabled one, and it defeats the contrast tokens
   * besides.
   */
  disabled: 0.45,
  /** Press feedback in the app, where there is no hover to lean on. */
  pressed: 0.85,
} as const;

/* ========================================================================== *
 * 8. QR
 * ========================================================================== */

/**
 * The QR surfaces exist in both runtimes and have to agree: a ticket rendered
 * in the member app must scan from the committee portal's camera, at a venue
 * door, in whatever lighting that door has.
 *
 * These values are deliberately NOT theme-aware. Pure black on pure white is
 * the only pairing scanners are calibrated for, and it stays that way in dark
 * mode. This is the one place in the package where a constant ground is correct
 * — and note that it still carries its ink alongside it rather than borrowing
 * the theme's.
 *
 * No decorative overlay on the code, ever. A styled QR that fails to scan at
 * the door is a total failure of the demo, not a visual nitpick.
 */
export const qr = {
  /** Modules of clear margin. 4 is the spec minimum; going below it is why codes fail to acquire. */
  quietZoneModules: 4,
  foreground: "#000000" as Hex,
  background: "#FFFFFF" as Hex,
  /** Minimum rendered edge, in px/dp. Below this, phone cameras struggle at arm's length. */
  minSize: 240,
  /** Screen brightness to request while a ticket or membership card is displayed. */
  displayBrightness: 1,
} as const;

/* ========================================================================== *
 * 9. Theme
 * ========================================================================== */

export type ThemeName = "light" | "dark";

export interface Theme {
  readonly name: ThemeName;

  /** The four neutral grounds a screen is built from. */
  readonly surface: {
    /** The page / screen background behind everything. */
    readonly app: Surface;
    /** Cards, panels, list containers. */
    readonly card: Surface;
    /** Inset wells: input backgrounds, table headers, code blocks. */
    readonly sunken: Surface;
    /** Modals, sheets, popovers. */
    readonly overlay: Surface;
  };

  readonly brand: {
    /**
     * The logo's own red. Reserved for the mark. It is not a `Surface` because
     * it is not a ground you put arbitrary content on — if you are painting a
     * background, you want `brand.solid`, which carries its ink.
     */
    readonly mark: Hex;
    /** Primary actions and brand chrome. */
    readonly solid: Surface;
    /** Brand-tinted wash: highlighted rows, member-only markers, quiet banners. */
    readonly subtle: Surface;
  };

  readonly status: Readonly<Record<StatusName, StatusRole>>;

  /**
   * Interactive text — links and text buttons sitting on a NEUTRAL surface.
   * Every state clears 4.5:1 against all four neutral grounds of its theme.
   *
   * On a coloured ground, do not use these: use that surface's own `ink` and
   * `outline`. This is the same pairing rule again.
   */
  readonly link: {
    readonly ink: Hex;
    readonly hover: Hex;
    readonly pressed: Hex;
  };

  /** Backdrop behind a modal. An rgba string, not a hex — it composites. */
  readonly scrim: string;
}
