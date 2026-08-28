/**
 * Light theme — the resolution of every colour role for `prefers-color-scheme: light`.
 *
 * This is the theme with real provenance: almost every ground here was read off
 * csa-rotterdam.nl. See the PROVENANCE block at the top of `tokens.ts` for what
 * the tags mean; see `dark.ts` for the theme that has none.
 *
 * Every ratio in the comments below was computed with `contrastRatio` from
 * `./contrast` and is asserted in `contrast.test.ts`. If you change a value,
 * the test tells you; do not update a comment without re-running it.
 */

import { palette, STATUS_SIGNAL, type Theme } from "./tokens";

export const lightTheme: Theme = {
  name: "light",

  surface: {
    /** [SOURCE] the site's own page background. */
    app: {
      ground: palette.neutral.page, //        #F9F9FB
      ink: palette.neutral.ink, //            16.00:1
      inkMuted: palette.neutral.inkMuted, //   6.30:1
      hairline: "#E8E3E4",
      outline: palette.neutral.outline, //     3.68:1
      focusRing: palette.red.mark, //          5.55:1
    },

    /** [SOURCE] white, from both the logo and the site palette. */
    card: {
      ground: palette.neutral.white, //       #FFFFFF
      ink: palette.neutral.ink, //            16.82:1
      inkMuted: palette.neutral.inkMuted, //   6.62:1
      hairline: "#EAE5E6",
      outline: palette.neutral.outline, //     3.86:1
      focusRing: palette.red.mark, //          5.84:1
    },

    /** [SOURCE] the site's secondary grey. Inputs, table headers, wells. */
    sunken: {
      ground: palette.neutral.sunken, //      #F4F4F4
      ink: palette.neutral.ink, //            15.29:1
      inkMuted: palette.neutral.inkMuted, //   6.02:1  <- the tightest neutral pairing in this theme
      hairline: "#E2DDDE",
      outline: palette.neutral.outline, //     3.51:1
      focusRing: palette.red.mark, //          5.31:1
    },

    overlay: {
      ground: palette.neutral.white, //       #FFFFFF
      ink: palette.neutral.ink, //            16.82:1
      inkMuted: palette.neutral.inkMuted, //   6.62:1
      hairline: "#EAE5E6",
      outline: palette.neutral.outline, //     3.86:1
      focusRing: palette.red.mark, //          5.84:1
    },
  },

  brand: {
    mark: palette.red.mark,

    /**
     * [SOURCE] The logo's own pairing, unchanged: #FFFFFF on #C1272D, 5.84:1.
     * That the mark itself already clears AA for body text is the single most
     * useful thing the brand gave us.
     *
     * The headroom above 4.5:1 is only 1.3x, which is why `inkMuted` here is a
     * very pale pink rather than a mid-tone: there is no room for a
     * conventional secondary tier on this ground. That is a real constraint of
     * the brand colour, not an oversight. If a surface needs three tiers of
     * text, it wants `surface.card`, not `brand.solid`.
     */
    solid: {
      ground: palette.red.mark, //            #C1272D
      ink: palette.neutral.white, //           5.84:1
      inkMuted: "#FAE7E8", //                  4.91:1
      hairline: "#D45B60",
      outline: palette.red.tintPale, //        4.18:1
      focusRing: palette.neutral.white, //     5.84:1
    },

    /** [SOURCE] the site's own pink wash under its own deep red. */
    subtle: {
      ground: palette.red.wash, //            #FFF1F2
      ink: palette.red.darkest, //            10.45:1
      inkMuted: palette.red.deep, //           6.26:1
      hairline: "#F7DADB",
      outline: palette.red.mid, //             4.05:1
      focusRing: palette.red.deep, //          6.26:1
    },
  },

  status: {
    success: {
      ...STATUS_SIGNAL.success,
      solid: {
        ground: palette.green.solid, //       #176B37  [DERIVED from the site's #23A455]
        ink: palette.neutral.white, //          6.57:1
        inkMuted: "#E8F0EB", //                 5.66:1
        hairline: "#2E7C4B",
        outline: "#C6DDD0", //                  4.59:1
        focusRing: palette.neutral.white, //    6.57:1
      },
      subtle: {
        ground: palette.green.wash, //        #E9F6EE
        ink: "#0F4A26", //                      9.31:1
        inkMuted: palette.green.solid, //       5.91:1
        hairline: "#D3EADD",
        outline: "#3E8A58", //                  3.79:1
        focusRing: palette.green.solid, //      5.91:1
      },
    },

    /**
     * The gold ground is [SOURCE] and IDENTICAL in both themes, with dark ink in
     * both. Worth reading `dark.ts` alongside this: a ground that does not flip
     * is not a bug, but ink that flips underneath a ground that does not is —
     * and the only reason that is obvious here is that both are declared in the
     * same object.
     */
    warning: {
      ...STATUS_SIGNAL.warning,
      solid: {
        ground: palette.gold.base, //         #E9C450
        ink: "#3A2704", //                      8.48:1
        inkMuted: "#5A420C", //                 5.62:1
        hairline: "#C9A63C",
        outline: "#6B5214", //                  4.39:1
        focusRing: "#3A2704", //                8.48:1
      },
      subtle: {
        ground: "#FBF4E0", //                 [PROVISIONAL] gold at 82% toward white
        ink: "#4A3309", //                     10.81:1
        inkMuted: "#6B5214", //                 6.73:1
        hairline: "#F0E4C4",
        outline: "#8A6D22", //                  4.46:1
        focusRing: "#4A3309", //               10.81:1
      },
    },

    /** See the danger note in `STATUS_SIGNAL` — this red is the brand's neighbour. */
    danger: {
      ...STATUS_SIGNAL.danger,
      solid: {
        ground: palette.red.deeper, //        #981A20  [SOURCE]
        ink: palette.neutral.white, //          8.39:1
        inkMuted: "#F6DDDE", //                 6.52:1
        hairline: "#B33840",
        outline: "#EFC9CB", //                  5.55:1
        focusRing: palette.neutral.white, //    8.39:1
      },
      subtle: {
        ground: "#FBEDED", //                 [PROVISIONAL]
        ink: "#6E1216", //                     10.47:1
        inkMuted: palette.red.deeper, //        7.36:1
        hairline: "#F2D8D9",
        outline: "#B4383E", //                  5.16:1
        focusRing: palette.red.deeper, //       7.36:1
      },
    },

    /** [PROVISIONAL] — the weakest provenance in the palette. See `palette.blue`. */
    info: {
      ...STATUS_SIGNAL.info,
      solid: {
        ground: palette.blue.solid, //        #1D6B85
        ink: palette.neutral.white, //          6.01:1
        inkMuted: "#DCEAEF", //                 4.88:1
        hairline: "#35809A",
        outline: "#BBD6DF", //                  3.95:1
        focusRing: palette.neutral.white, //    6.01:1
      },
      subtle: {
        ground: palette.blue.wash, //         #E4EDF0
        ink: "#114A5D", //                      8.18:1
        inkMuted: palette.blue.solid, //        5.06:1
        hairline: "#D0E0E6",
        outline: "#3D8299", //                  3.64:1
        focusRing: palette.blue.solid, //       5.06:1
      },
    },
  },

  /**
   * [SOURCE] the site's deep red, which clears AA on all four neutral grounds
   * (6.25:1 at worst, on `sunken`). Hover and pressed go darker rather than
   * lighter, which keeps them clearing too.
   */
  link: {
    ink: palette.red.deep, //      #A5302A   >= 6.25:1 on every neutral ground
    hover: "#7F211C", //                     >= 8.94:1
    pressed: palette.red.darkest, //         >= 10.44:1
  },

  /** Warm-black backdrop, matched to `neutral.ink` rather than pure black. */
  scrim: "rgba(36, 27, 28, 0.5)",
};

export default lightTheme;
