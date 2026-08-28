import { describe, expect, it } from "vitest";

import { durationFor, easingPoints, motionTokens, secondsFor } from "./index";
import { nativeMotionPlan } from "./native";
import {
  allowsSpatialPointerResponse,
  isMotionProviderEffectEnabled,
  motionProviderEffects,
  type PointerResponseEnvironment,
} from "./web-contract";

describe("canonical motion vocabulary", () => {
  it("keeps one ordered five-beat timing family", () => {
    expect(Object.values(motionTokens.duration)).toEqual([120, 240, 480, 760, 1100]);
    expect(Object.values(motionTokens.seconds)).toEqual([0.12, 0.24, 0.48, 0.76, 1.1]);
  });

  it("collapses duration, not final state, for reduced motion", () => {
    expect(durationFor("cinematic", true)).toBe(0);
    expect(secondsFor("base", true)).toBe(0);
    expect(nativeMotionPlan("slow", "enter", true)).toEqual({
      duration: 0,
      easing: easingPoints("enter"),
      reduceMotion: true,
    });
  });

  it("exposes zero-bounce springs", () => {
    for (const spring of Object.values(motionTokens.spring)) {
      expect(spring.bounce).toBe(0);
    }
  });
});

describe("web runtime contracts", () => {
  it("keeps every provider effect disabled until it is named explicitly", () => {
    expect(motionProviderEffects).toEqual([
      "declarative-scene",
      "route-transition",
      "scroll-progress",
    ]);

    for (const effect of motionProviderEffects) {
      expect(isMotionProviderEffectEnabled([], effect)).toBe(false);
      expect(isMotionProviderEffectEnabled([effect], effect)).toBe(true);
      for (const otherEffect of motionProviderEffects) {
        if (otherEffect !== effect) {
          expect(isMotionProviderEffectEnabled([effect], otherEffect)).toBe(false);
        }
      }
    }
  });

  it("stops spatial pointer response for every environment lifecycle gate", () => {
    const active: PointerResponseEnvironment = {
      documentVisible: true,
      finePointer: true,
      inViewport: true,
      reducedMotion: false,
    };
    expect(allowsSpatialPointerResponse(active)).toBe(true);

    const blocked: ReadonlyArray<
      readonly [keyof PointerResponseEnvironment, PointerResponseEnvironment]
    > = [
      ["documentVisible", { ...active, documentVisible: false }],
      ["finePointer", { ...active, finePointer: false }],
      ["inViewport", { ...active, inViewport: false }],
      ["reducedMotion", { ...active, reducedMotion: true }],
    ];
    for (const [, environment] of blocked) {
      expect(allowsSpatialPointerResponse(environment)).toBe(false);
    }
  });
});
