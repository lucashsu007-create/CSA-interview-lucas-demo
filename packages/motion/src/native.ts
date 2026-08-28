/**
 * Native adapter for Expo / React Native.
 *
 * This module has no DOM, React, or React Native import. Apps inject the value
 * returned by `AccessibilityInfo.isReduceMotionEnabled()` and bind the returned
 * points to their own animation engine. Hidden initial states must still be
 * composed as visible when motion is reduced; zero duration alone is not an
 * accessibility strategy.
 */

import {
  durationFor,
  easingPoints,
  motionTokens,
  secondsFor,
  shouldReduceMotion,
  type MotionDuration,
  type MotionEasing,
} from "./index";

export interface NativeMotionPlan {
  readonly duration: number;
  readonly easing: ReturnType<typeof easingPoints>;
  readonly reduceMotion: boolean;
}

export function nativeMotionPlan(
  duration: MotionDuration,
  easing: MotionEasing,
  preference: boolean | null | undefined,
): NativeMotionPlan {
  const reduceMotion = shouldReduceMotion(preference);
  return {
    duration: durationFor(duration, reduceMotion),
    easing: easingPoints(easing),
    reduceMotion,
  };
}

export {
  durationFor,
  easingPoints,
  motionTokens,
  secondsFor,
  shouldReduceMotion,
  type MotionDuration,
  type MotionEasing,
};
