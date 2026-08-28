/**
 * Provider-level effects are opt-in so mounting the shared runtime does not
 * silently add choreography, navigation interception, or continuous work.
 */
export const motionProviderEffects = [
  "declarative-scene",
  "route-transition",
  "scroll-progress",
] as const;

export type MotionProviderEffect = (typeof motionProviderEffects)[number];
export type MotionProviderEffects = readonly MotionProviderEffect[];

export function isMotionProviderEffectEnabled(
  effects: MotionProviderEffects,
  effect: MotionProviderEffect,
): boolean {
  return effects.includes(effect);
}

export interface PointerResponseEnvironment {
  readonly documentVisible: boolean;
  readonly finePointer: boolean;
  readonly inViewport: boolean;
  readonly reducedMotion: boolean;
}

/** Shared eligibility gate for Motion and Anime.js pointer responses. */
export function allowsSpatialPointerResponse({
  documentVisible,
  finePointer,
  inViewport,
  reducedMotion,
}: PointerResponseEnvironment): boolean {
  return documentVisible && finePointer && inViewport && !reducedMotion;
}
