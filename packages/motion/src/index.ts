/**
 * @csa/motion — CSA's single runtime-neutral motion vocabulary.
 *
 * This root deliberately imports no browser, React, React Native, Motion, or
 * Anime.js runtime. Web code imports `@csa/motion/web`; native code imports
 * `@csa/motion/native`. Timing is owned here so neither the material-token
 * package nor an individual surface can quietly create a competing rhythm.
 */

export const MOTION_PROVENANCE = {
  sourceRepository: "lrl-systems",
  sourcePackage: "packages/motion",
  sourceCommit: "dc4b1ebfa30e455fd4fef60b112ad5d483c9e851",
  adaptation: "CSA-owned semantic profiles, identity inputs, hooks, and runtime boundaries",
} as const;

export const motionTokens = {
  duration: {
    instant: 120,
    fast: 240,
    base: 480,
    slow: 760,
    cinematic: 1100,
  },
  seconds: {
    instant: 0.12,
    fast: 0.24,
    base: 0.48,
    slow: 0.76,
    cinematic: 1.1,
  },
  easing: {
    enter: {
      anime: "out(4)",
      css: "cubic-bezier(0.22, 1, 0.36, 1)",
      points: [0.22, 1, 0.36, 1] as const,
    },
    exit: {
      anime: "in(3)",
      css: "cubic-bezier(0.64, 0, 0.78, 0)",
      points: [0.64, 0, 0.78, 0] as const,
    },
    standard: {
      anime: "inOut(3)",
      css: "cubic-bezier(0.65, 0, 0.35, 1)",
      points: [0.65, 0, 0.35, 1] as const,
    },
    elastic: {
      anime: "outElastic(1, .55)",
      css: "cubic-bezier(0.16, 1, 0.3, 1)",
      points: [0.16, 1, 0.3, 1] as const,
    },
  },
  stagger: {
    tight: 35,
    standard: 70,
    generous: 110,
  },
  spring: {
    press: { type: "spring", stiffness: 520, damping: 34, mass: 0.55, bounce: 0 },
    layout: { type: "spring", stiffness: 430, damping: 38, mass: 0.72, bounce: 0 },
    ambient: { type: "spring", stiffness: 170, damping: 24, mass: 0.8, bounce: 0 },
  },
} as const;

export type MotionDuration = keyof typeof motionTokens.duration;
export type MotionEasing = keyof typeof motionTokens.easing;
export type MotionProfile = "public" | "operations";
export type MotionOwner = "anime" | "motion" | "css";
export type EasingPoints = readonly [number, number, number, number];

/** Runtime-neutral reduced-motion predicate for adapters and tests. */
export function shouldReduceMotion(preference: boolean | null | undefined): boolean {
  return preference === true;
}

/** Milliseconds for a named beat, collapsed to zero for reduced motion. */
export function durationFor(name: MotionDuration, reduceMotion: boolean): number {
  return reduceMotion ? 0 : motionTokens.duration[name];
}

/** Seconds for libraries whose transition API is expressed in seconds. */
export function secondsFor(name: MotionDuration, reduceMotion: boolean): number {
  return reduceMotion ? 0 : motionTokens.seconds[name];
}

/** Four portable control points for CSS, Motion, or React Native Easing. */
export function easingPoints(name: MotionEasing): EasingPoints {
  return motionTokens.easing[name].points;
}
