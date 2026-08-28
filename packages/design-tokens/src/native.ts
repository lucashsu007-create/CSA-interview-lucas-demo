/**
 * React Native / Expo material bridge.
 *
 * DELIBERATELY HAS NO DEPENDENCY ON `react-native`, not even a type import.
 * The web surfaces consume sibling entry points from this package, and pulling
 * RN types into a workspace typecheck is how a shared material layer stops
 * being shared. Everything here is structurally typed and dependency-injected:
 * `createUseTheme` takes the app's own `useColorScheme` rather than importing one.
 *
 * The differences this file exists to absorb are not cosmetic:
 *
 *   - RN `letterSpacing` is in absolute points; the tokens store em. Converted.
 *   - RN has no font fallback stack — `fontFamily` must be one bundled family.
 *   - RN on Android does not synthesise weights from a family, so each weight is
 *     a separately-registered family name. See `nativeFontFamily`.
 *   - Shadows are three incompatible models (web, iOS, Android). See `shadowStyle`.
 *   - There is no hover and no focus ring. The state model is pressed and
 *     disabled. Do not port a web component's interaction states literally.
 */

import {
  durationFor,
  easingPoints,
  motionTokens,
  nativeMotionPlan,
  secondsFor,
  shouldReduceMotion,
} from "@csa/motion/native";

import { darkTheme } from "./dark";
import { lightTheme } from "./light";
import {
  elevation,
  fontFamily,
  opacity,
  size,
  typeScale,
  type Elevation,
  type ElevationName,
  type FontWeight,
  type Theme,
  type TypeStep,
  type TypeStepName,
} from "./tokens";

/**
 * Structural match for React Native's `ColorSchemeName`, declared here rather
 * than imported. `null`/`undefined` mean "no preference expressed", which
 * resolves to light.
 */
export type ColorSchemeName = "light" | "dark" | null | undefined;

/**
 * The whole theme resolution, in one place.
 *
 * Theme comes from `useColorScheme()` resolving tokens — never from per-theme
 * values hardcoded inside a component. A component that branches on the scheme
 * itself has re-created the bug this package exists to prevent.
 */
export function resolveTheme(scheme: ColorSchemeName): Theme {
  return scheme === "dark" ? darkTheme : lightTheme;
}

/**
 * Builds the app's `useTheme` hook from the app's own `useColorScheme`.
 *
 * In `apps/mobile`, once:
 *
 * ```ts
 * import { useColorScheme } from 'react-native';
 * import { createUseTheme } from '@csa/design-tokens/native';
 *
 * export const useTheme = createUseTheme(useColorScheme);
 * ```
 *
 * and from then on `const theme = useTheme()`. The injection is what keeps this
 * package free of a React Native dependency while still giving the app a hook
 * that re-renders on a system theme change.
 */
export function createUseTheme(useColorScheme: () => ColorSchemeName): () => Theme {
  return function useTheme(): Theme {
    return resolveTheme(useColorScheme());
  };
}

/* ========================================================================== *
 * Typography
 * ========================================================================== */

/**
 * The family name to hand React Native for a given weight.
 *
 * On Android, `{ fontFamily: 'Poppins', fontWeight: '600' }` silently renders
 * regular — the platform will not pick a weight out of a family the way a
 * browser does. Each weight has to be bundled and referenced as its own family.
 *
 * The app must therefore ship these four files and register them under exactly
 * these names (Expo: `useFonts({ 'Poppins-Regular': require(...), ... })`):
 *
 *   Poppins-Regular, Poppins-Medium, Poppins-SemiBold, Poppins-Bold
 *
 * Bundled from the repo, not fetched. There is no remote font anywhere in this
 * system.
 */
export function nativeFontFamily(weight: FontWeight, family: "sans" | "mono" = "sans"): string {
  const base = family === "mono" ? "JetBrainsMono" : "Poppins";
  const suffix: Record<FontWeight, string> = {
    400: "Regular",
    500: "Medium",
    600: "SemiBold",
    700: "Bold",
  };
  return `${base}-${suffix[weight]}`;
}

export interface NativeTextStyle {
  fontFamily: string;
  fontSize: number;
  lineHeight: number;
  /** Absolute points, converted from the token's em value. */
  letterSpacing: number;
  fontWeight: string;
}

/**
 * A type-scale step as a React Native text style.
 *
 * Takes the step whole — size, line-height, letter-spacing and weight together.
 * Overriding one of them at a call site is fighting a tuned scale; if a screen
 * needs a size that is not on the scale, the scale is the thing to discuss.
 */
export function textStyle(
  step: TypeStepName | TypeStep,
  options: { family?: "sans" | "mono"; weight?: FontWeight } = {},
): NativeTextStyle {
  const t: TypeStep = typeof step === "string" ? typeScale[step] : step;
  const weight = options.weight ?? t.weight;
  return {
    fontFamily: nativeFontFamily(weight, options.family ?? "sans"),
    fontSize: t.size,
    lineHeight: t.lineHeight,
    letterSpacing: t.letterSpacing * t.size,
    fontWeight: String(weight),
  };
}

/**
 * Numbers compared against other numbers — capacity counts, attendance totals,
 * prices, countdowns.
 *
 * Reliable on iOS. On Android `fontVariant` is widely ignored, so for a column
 * that genuinely has to line up, use `textStyle(step, { family: 'mono' })`
 * instead of trusting this.
 */
export const tabularNumbers = Object.freeze({
  fontVariant: ["tabular-nums"] as const,
});

/* ========================================================================== *
 * Elevation
 * ========================================================================== */

export interface NativeShadowStyle {
  shadowColor: string;
  shadowOffset: { width: number; height: number };
  shadowOpacity: number;
  shadowRadius: number;
  /** Android reads only this and ignores every property above it. */
  elevation: number;
}

/**
 * Elevation as RN shadow props.
 *
 * Two lossy conversions, both unavoidable: iOS `shadowRadius` is roughly half a
 * CSS blur, and RN has no concept of spread at all, so `overlay`'s negative
 * spread is simply dropped. That is fine because elevation is meaning here, not
 * a pixel-matched effect — the levels need to be distinguishable from each
 * other, not identical across platforms.
 *
 * Default to `flat` and a hairline border. A shadow should mean something has
 * lifted.
 */
export function shadowStyle(level: ElevationName | Elevation): NativeShadowStyle {
  const e: Elevation = typeof level === "string" ? elevation[level] : level;
  return {
    shadowColor: e.color,
    shadowOffset: { width: 0, height: e.y },
    shadowOpacity: e.opacity,
    shadowRadius: e.blur / 2,
    elevation: e.androidElevation,
  };
}

/* ========================================================================== *
 * Touch targets
 * ========================================================================== */

export interface HitSlop {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

/**
 * Closes the gap between a small piece of artwork and the touch floor.
 *
 * A 20px icon button is a 20px touch target unless you say otherwise, and 20px
 * is roughly half of what a thumb needs. `hitSlopFor(20)` extends it to 48
 * without changing a pixel of layout.
 *
 * The floor is 44pt on iOS and 48dp on Android; this uses 48 for both, because
 * one number that satisfies both platforms beats two that need branching. It is
 * a floor, not a target — a primary action wants more.
 */
export function hitSlopFor(renderedSize: number, target: number = size.touchTarget.min): HitSlop {
  const pad = Math.max(0, Math.round((target - renderedSize) / 2));
  return { top: pad, bottom: pad, left: pad, right: pad };
}

/* ========================================================================== *
 * States
 * ========================================================================== */

/**
 * The app's entire interaction state model: pressed and disabled. There is no
 * hover and no focus ring on a touch device, so a component ported from the
 * portal should lose those states rather than emulate them.
 *
 * Disabled is opacity PLUS non-interactivity — set `disabled` on the Pressable
 * as well, and give it `accessibilityState={{ disabled: true }}`. Opacity alone
 * looks disabled to a sighted user and is fully interactive to everyone else.
 */
export function stateOpacity(state: { pressed?: boolean; disabled?: boolean }): number {
  if (state.disabled) return opacity.disabled;
  if (state.pressed) return opacity.pressed;
  return 1;
}

/** Motion is re-exported for native consumers; `@csa/motion` remains its owner. */
export {
  durationFor,
  easingPoints,
  motionTokens,
  nativeMotionPlan,
  secondsFor,
  shouldReduceMotion,
};

export { fontFamily, size, typeScale };
