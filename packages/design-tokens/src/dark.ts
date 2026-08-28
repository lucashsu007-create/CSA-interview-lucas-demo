/**
 * Dark theme.
 *
 * ---------------------------------------------------------------------------
 * EVERY VALUE IN THIS FILE IS [PROVISIONAL].
 * ---------------------------------------------------------------------------
 * csa-rotterdam.nl has no dark mode. There was nothing to read, so nothing here
 * is derived from CSA's published brand — it is this repo's construction,
 * anchored to the light theme's hues and validated against WCAG AA. It needs
 * board confirmation before anyone calls it CSA's dark theme.
 *
 * The two exceptions, both deliberate and both explained below, are
 * `brand.solid` and `status.warning.solid`, whose grounds are carried across
 * from the light theme unchanged.
 *
 * A derived dark palette is where a new layout breaks first. Check every width
 * in both themes, not just light.
 */

import { palette, STATUS_SIGNAL, type Theme } from "./tokens";

export const darkTheme: Theme = {
  name: "dark",

  /**
   * The neutral ramp is warm rather than blue-black: a pure grey ramp reads
   * cold beside a saturated red, and CSA's red is the one fixed point we have.
   */
  surface: {
    app: {
      ground: palette.dark.app, //            #141011
      ink: palette.dark.ink, //               16.89:1
      inkMuted: palette.dark.inkMuted, //      6.45:1
      hairline: "#2A2325",
      outline: palette.dark.outline, //        3.95:1
      focusRing: palette.red.tint, //          9.29:1
    },

    card: {
      ground: palette.dark.card, //           #1D1819
      ink: palette.dark.ink, //               15.69:1
      inkMuted: palette.dark.inkMuted, //      5.99:1
      hairline: "#302829",
      outline: palette.dark.outline, //        3.67:1
      focusRing: palette.red.tint, //          8.63:1
    },

    sunken: {
      ground: palette.dark.sunken, //         #0D0A0B
      ink: palette.dark.ink, //               17.63:1
      inkMuted: palette.dark.inkMuted, //      6.73:1
      hairline: "#241E1F",
      outline: palette.dark.outline, //        4.12:1
      focusRing: palette.red.tint, //          9.69:1
    },

    /** The lightest dark ground, so every ink here is at its tightest. */
    overlay: {
      ground: palette.dark.overlay, //        #251F21
      ink: palette.dark.ink, //               14.49:1
      inkMuted: palette.dark.inkMuted, //      5.53:1
      hairline: "#362D2F",
      outline: "#807678", //                   3.69:1
      focusRing: palette.red.tint, //          7.96:1
    },
  },

  brand: {
    mark: palette.red.mark,

    /**
     * IDENTICAL to the light theme, on purpose, and this is the case the UI
     * standard warns about — so read it carefully.
     *
     * The warning is about a constant ground with FLIPPING ink. Here the ground
     * is constant (#C1272D, because the brand does not get a different red
     * after dark) and the ink is constant with it (#FFFFFF, 5.84:1). The pair
     * travels together, so it measures the same in both themes.
     *
     * The reason that is safe is structural rather than lucky: `Surface` has no
     * inherited fields. This object had to restate its ink, so the choice to
     * keep it white was made here, in the dark theme, where a reviewer can see
     * it — instead of being silently inherited from a global text colour that
     * flipped to near-black three files away.
     */
    solid: {
      ground: palette.red.mark, //            #C1272D
      ink: palette.neutral.white, //           5.84:1
      inkMuted: "#FAE7E8", //                  4.91:1
      hairline: "#D45B60",
      outline: palette.red.tintPale, //        4.18:1
      focusRing: palette.neutral.white, //     5.84:1
    },

    /** The wash inverts: a dark red ground carrying light red ink. */
    subtle: {
      ground: "#3A1416",
      ink: "#F3B9BC", //                       9.66:1
      inkMuted: "#D18B8F", //                  6.04:1
      hairline: "#4E1E21",
      outline: "#AB575C", //                   3.29:1
      focusRing: "#F3B9BC", //                 9.66:1
    },
  },

  status: {
    /**
     * The solid status grounds LIGHTEN in dark mode and their ink goes dark.
     * That is the inversion the light theme's solids need: a #176B37 chip on a
     * #141011 page is nearly invisible, whereas the same green at #4CB877 reads
     * as a lit indicator against a dark ground.
     */
    success: {
      ...STATUS_SIGNAL.success,
      solid: {
        ground: palette.green.bright, //      #4CB877
        ink: "#04220E", //                      6.80:1
        inkMuted: "#113E22", //                 4.86:1
        hairline: "#2C7E4E",
        outline: "#0B3B1D", //                  5.09:1
        focusRing: "#04220E", //                6.80:1
      },
      subtle: {
        ground: "#0F2A1B",
        ink: "#9FE0B7", //                     10.11:1
        inkMuted: "#6FB98C", //                 6.58:1
        hairline: "#1A3E29",
        outline: "#44805D", //                  3.28:1
        focusRing: "#9FE0B7", //               10.11:1
      },
    },

    /**
     * The gold ground and its dark ink are carried across from the light theme
     * unchanged — the second deliberate constant, and the clearest illustration
     * of why `Surface` exists.
     *
     * Warning is the one status whose ink is dark in BOTH themes. Any component
     * that reached for the theme's own text colour instead of this surface's
     * `ink` would render near-white text on gold here and measure 1.4:1. The
     * only reason that cannot happen is that the ground and the ink are the
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
        ground: "#2E2409",
        ink: "#F1D68A", //                     10.73:1
        inkMuted: "#BFA463", //                 6.34:1
        hairline: "#43360F",
        outline: "#867233", //                  3.26:1
        focusRing: "#F1D68A", //               10.73:1
      },
    },

    /**
     * Danger lightens past the brand red rather than darkening below it, so the
     * two separate in the other direction from light mode. See the danger note
     * in `STATUS_SIGNAL`: the icon and label do the real work.
     */
    danger: {
      ...STATUS_SIGNAL.danger,
      solid: {
        ground: "#E5646B",
        ink: "#2C0507", //                      5.63:1
        inkMuted: "#470B0E", //                 4.82:1
        hairline: "#B84850",
        outline: "#3F0B0E", //                  5.03:1
        focusRing: "#2C0507", //                5.63:1
      },
      subtle: {
        ground: "#331113",
        ink: "#F3B3B6", //                      9.70:1
        inkMuted: "#C88488", //                 5.78:1
        hairline: "#472023",
        outline: "#A2575C", //                  3.30:1
        focusRing: "#F3B3B6", //                9.70:1
      },
    },

    info: {
      ...STATUS_SIGNAL.info,
      solid: {
        ground: palette.blue.bright, //       #5FB3CE
        ink: "#04212B", //                      7.02:1
        inkMuted: "#123E4E", //                 4.84:1
        hairline: "#2E86A3",
        outline: "#0A3541", //                  5.52:1
        focusRing: "#04212B", //                7.02:1
      },
      subtle: {
        ground: "#0F2630",
        ink: "#A9D8E7", //                     10.19:1
        inkMuted: "#78AFC0", //                 6.49:1
        hairline: "#1A3945",
        outline: "#4A7F92", //                  3.54:1
        focusRing: "#A9D8E7", //               10.19:1
      },
    },
  },

  /**
   * The link colour is where the brand red genuinely CANNOT stay constant.
   * #A5302A on the dark app ground measures 1.7:1 and #C1272D measures 3.2:1 —
   * both unreadable as text. So the interactive red lightens to the source
   * palette's own tint. This is the flip the light theme's `link` block does
   * not need, and it is the reason `link` is a theme field rather than a
   * constant.
   */
  link: {
    ink: palette.red.tint, //      #E4A6A9   >= 7.96:1 on every neutral ground
    hover: "#F2C4C6", //                     >= 10.40:1
    pressed: "#CE8B8F", //                   >= 5.95:1
  },

  scrim: "rgba(0, 0, 0, 0.6)",
};

export default darkTheme;
