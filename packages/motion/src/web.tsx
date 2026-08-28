"use client";

import { animate } from "animejs/animation";
import { createAnimatable } from "animejs/animatable";
import { spring as animeSpring } from "animejs/easings";
import { onScroll } from "animejs/events";
import { createScope } from "animejs/scope";
import { createDrawable } from "animejs/svg";
import { scrambleText, splitText } from "animejs/text";
import { createTimeline } from "animejs/timeline";
import { stagger } from "animejs/utils";
import { waapi } from "animejs/waapi";
import {
  LazyMotion,
  MotionConfig,
  useMotionValue,
  useReducedMotion,
  useScroll,
  useSpring,
  useTransform,
} from "motion/react";
import * as m from "motion/react-m";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type FocusEvent as ReactFocusEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type RefObject,
} from "react";

import { motionTokens, type MotionProfile } from "./index";
import {
  allowsSpatialPointerResponse,
  isMotionProviderEffectEnabled,
  type MotionProviderEffects,
} from "./web-contract";

type Navigate = (href: string) => void | Promise<void>;

export interface MotionIdentity {
  /** Surface name shown during a full-view handoff. Never guessed by the package. */
  readonly label: string;
  /** Active signal color from the surface's material tokens. */
  readonly accent: string;
  /** Ground used by the full-view transition curtain. */
  readonly curtain: string;
  /** Primary ink paired with `curtain`. */
  readonly curtainInk: string;
  /** Secondary ink paired with `curtain`. */
  readonly curtainInkMuted: string;
}

export interface MotionNavigation {
  readonly beginTransition: (label?: string) => Promise<void>;
  readonly cancelTransition: () => Promise<void>;
}

export interface MotionProviderProps {
  readonly children: ReactNode;
  /**
   * Every provider-level effect is explicitly enabled at the callsite and
   * requires a matching approved surface-manifest effect contract.
   */
  readonly effects: MotionProviderEffects;
  readonly identity: MotionIdentity;
  readonly navigate: Navigate;
  readonly profile: MotionProfile;
  readonly routeKey: string;
}

const noMotionNavigation: MotionNavigation = {
  beginTransition: async () => undefined,
  cancelTransition: async () => undefined,
};

const MotionNavigationContext = createContext<MotionNavigation>(noMotionNavigation);
const loadMotionFeatures = () => import("./motion-features").then((module) => module.default);

export function useMotionTransition(): MotionNavigation {
  return useContext(MotionNavigationContext);
}

/**
 * The motion root mounted once by a CSA React surface.
 *
 * Identity values are required. A shared behavior package cannot infer the
 * correct CSA material pairing for a public page, an operations shell, or a
 * future campaign. Requiring them prevents a silent brand-color fallback.
 */
export function MotionProvider({
  children,
  effects,
  routeKey,
  navigate,
  profile,
  identity,
}: MotionProviderProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const curtainRef = useRef<HTMLDivElement>(null);
  const labelRef = useRef<HTMLSpanElement>(null);
  const exitPromiseRef = useRef<Promise<void> | null>(null);
  const navigationFallbackRef = useRef<number | null>(null);
  const declarativeSceneEnabled = isMotionProviderEffectEnabled(effects, "declarative-scene");
  const routeTransitionEnabled = isMotionProviderEffectEnabled(effects, "route-transition");
  const scrollProgressEnabled = isMotionProviderEffectEnabled(effects, "scroll-progress");

  const hideCurtain = useCallback(async (): Promise<void> => {
    const overlay = curtainRef.current;
    if (overlay === null) return;

    if (navigationFallbackRef.current !== null) {
      window.clearTimeout(navigationFallbackRef.current);
      navigationFallbackRef.current = null;
    }

    if (prefersReducedMotion()) {
      resetCurtain(overlay);
      exitPromiseRef.current = null;
      return;
    }

    const meta = overlay.querySelector<HTMLElement>(".csa-motion-curtain__meta");
    const line = overlay.querySelector<HTMLElement>(".csa-motion-curtain__line");
    const timeline = createTimeline({
      defaults: { ease: motionTokens.easing.enter.anime },
    });

    if (meta !== null) {
      timeline.add(
        meta,
        {
          opacity: [1, 0],
          translateY: [0, -8],
          duration: motionTokens.duration.instant,
        },
        0,
      );
    }
    if (line !== null) {
      timeline.add(line, { scaleX: [1, 0], duration: motionTokens.duration.fast }, 0);
    }
    timeline.add(
      overlay,
      {
        translateY: ["0%", "-101%"],
        duration: motionTokens.duration.base,
        ease: motionTokens.easing.enter.anime,
      },
      motionTokens.stagger.standard,
    );

    await timeline;
    resetCurtain(overlay);
    exitPromiseRef.current = null;
  }, []);

  const beginTransition = useCallback(async (label = "Opening next view"): Promise<void> => {
    if (exitPromiseRef.current !== null) return exitPromiseRef.current;

    const overlay = curtainRef.current;
    if (overlay === null) return;
    if (labelRef.current !== null) labelRef.current.textContent = label;

    const transition = (async () => {
      overlay.classList.add("is-active");
      if (prefersReducedMotion()) {
        overlay.style.transform = "translate3d(0, 0, 0)";
        return;
      }

      const meta = overlay.querySelector<HTMLElement>(".csa-motion-curtain__meta");
      const line = overlay.querySelector<HTMLElement>(".csa-motion-curtain__line");
      const timeline = createTimeline({
        defaults: { ease: motionTokens.easing.exit.anime },
      });

      timeline.add(
        overlay,
        {
          translateY: ["101%", "0%"],
          duration: motionTokens.duration.base,
          ease: motionTokens.easing.standard.anime,
        },
        0,
      );
      if (line !== null) {
        timeline.add(
          line,
          {
            scaleX: [0, 1],
            duration: motionTokens.duration.fast,
            ease: motionTokens.easing.enter.anime,
          },
          `<<+=${motionTokens.duration.instant}`,
        );
      }
      if (meta !== null) {
        timeline.add(
          meta,
          {
            opacity: [0, 1],
            translateY: [10, 0],
            duration: motionTokens.duration.fast,
          },
          "<<",
        );
      }

      await timeline;
    })();

    exitPromiseRef.current = transition;
    return transition;
  }, []);

  useEffect(() => {
    if (routeTransitionEnabled && exitPromiseRef.current !== null) void hideCurtain();
  }, [hideCurtain, routeKey, routeTransitionEnabled]);

  useEffect(() => {
    if (routeTransitionEnabled) return;
    if (navigationFallbackRef.current !== null) {
      window.clearTimeout(navigationFallbackRef.current);
      navigationFallbackRef.current = null;
    }
    exitPromiseRef.current = null;
  }, [routeTransitionEnabled]);

  useEffect(() => {
    if (!declarativeSceneEnabled) return;

    const root = rootRef.current;
    if (root === null) return;

    let scope: ReturnType<typeof createScope> | null = null;
    let sceneCancelled = false;
    const reducedMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sceneRoot = root.querySelector<HTMLElement>("[data-csa-motion-scene]") ?? root;
    const entranceSelector = "[data-csa-motion-enter], [data-csa-motion-split]";

    const settleScene = () => {
      sceneCancelled = true;
      scope?.revert();
      scope = null;
    };

    const shouldSkipScene = () => {
      if (reducedMotionQuery.matches || document.visibilityState === "hidden") return true;
      const entranceTargets = Array.from(sceneRoot.querySelectorAll<HTMLElement>(entranceSelector));
      return (
        entranceTargets.length > 0 &&
        entranceTargets.every((target) => {
          const bounds = target.getBoundingClientRect();
          return bounds.bottom <= 0 || bounds.top >= window.innerHeight;
        })
      );
    };

    const frame = window.requestAnimationFrame(() => {
      if (sceneCancelled || shouldSkipScene()) return;
      scope = installScene(root, profile);
    });

    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") settleScene();
    };
    const handlePreferenceChange = () => {
      if (reducedMotionQuery.matches) settleScene();
    };
    const handleFocusIn = (event: FocusEvent) => {
      const target = event.target;
      if (
        target instanceof Element &&
        target.closest("a[href], button, input, select, textarea, [tabindex]") !== null
      ) {
        settleScene();
      }
    };
    const handleClick = (event: MouseEvent) => {
      const target = event.target;
      if (target instanceof Element && target.closest("a[href], button") !== null) {
        settleScene();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    reducedMotionQuery.addEventListener("change", handlePreferenceChange);
    document.addEventListener("focusin", handleFocusIn);
    document.addEventListener("click", handleClick);

    return () => {
      window.cancelAnimationFrame(frame);
      scope?.revert();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      reducedMotionQuery.removeEventListener("change", handlePreferenceChange);
      document.removeEventListener("focusin", handleFocusIn);
      document.removeEventListener("click", handleClick);
    };
  }, [declarativeSceneEnabled, profile, routeKey]);

  useEffect(() => {
    if (!routeTransitionEnabled) return;

    const root = rootRef.current;
    if (root === null) return;

    const handleClick = (event: globalThis.MouseEvent) => {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      ) {
        return;
      }

      const target = event.target;
      if (!(target instanceof Element)) return;
      const anchor = target.closest<HTMLAnchorElement>("a[href]");
      if (
        anchor === null ||
        anchor.hasAttribute("download") ||
        anchor.dataset.csaMotionIgnore !== undefined ||
        (anchor.target !== "" && anchor.target !== "_self")
      ) {
        return;
      }

      const url = new URL(anchor.href, window.location.href);
      if (url.protocol !== "http:" && url.protocol !== "https:") return;

      const current = new URL(window.location.href);
      const isSameDocument =
        url.origin === current.origin &&
        url.pathname === current.pathname &&
        url.search === current.search;
      if (isSameDocument) return;

      event.preventDefault();
      const isNative =
        anchor.dataset.csaMotionNative !== undefined || url.origin !== current.origin;
      const destination = `${url.pathname}${url.search}${url.hash}`;
      const label =
        anchor.dataset.csaMotionLabel ?? anchor.textContent?.trim() ?? "Opening next view";

      void beginTransition(label).then(() => {
        if (isNative) {
          window.location.assign(url.href);
          return;
        }

        void navigate(destination);
        navigationFallbackRef.current = window.setTimeout(() => {
          void hideCurtain();
        }, 4500);
      });
    };

    const handlePageShow = () => {
      if (exitPromiseRef.current !== null) void hideCurtain();
    };

    root.addEventListener("click", handleClick);
    window.addEventListener("pageshow", handlePageShow);
    return () => {
      root.removeEventListener("click", handleClick);
      window.removeEventListener("pageshow", handlePageShow);
      if (navigationFallbackRef.current !== null) {
        window.clearTimeout(navigationFallbackRef.current);
        navigationFallbackRef.current = null;
      }
    };
  }, [beginTransition, hideCurtain, navigate, routeTransitionEnabled]);

  const navigation = useMemo<MotionNavigation>(
    () =>
      routeTransitionEnabled
        ? { beginTransition, cancelTransition: hideCurtain }
        : noMotionNavigation,
    [beginTransition, hideCurtain, routeTransitionEnabled],
  );
  const style = {
    "--csa-motion-accent": identity.accent,
    "--csa-motion-curtain": identity.curtain,
    "--csa-motion-curtain-ink": identity.curtainInk,
    "--csa-motion-curtain-ink-muted": identity.curtainInkMuted,
  } as CSSProperties;

  return (
    <MotionConfig
      reducedMotion="user"
      transition={{
        duration: motionTokens.seconds.fast,
        ease: motionTokens.easing.enter.points,
      }}
    >
      <LazyMotion features={loadMotionFeatures} strict>
        <MotionNavigationContext.Provider value={navigation}>
          <div
            className="csa-motion-root"
            data-csa-motion-profile={profile}
            ref={rootRef}
            style={style}
          >
            {scrollProgressEnabled ? <ScrollProgress profile={profile} /> : null}
            {children}
            {routeTransitionEnabled ? (
              <div className="csa-motion-curtain" ref={curtainRef} aria-hidden="true">
                <span className="csa-motion-curtain__line" />
                <span className="csa-motion-curtain__meta">
                  <span>{identity.label}</span>
                  <span ref={labelRef}>Opening next view</span>
                </span>
              </div>
            ) : null}
          </div>
        </MotionNavigationContext.Provider>
      </LazyMotion>
    </MotionConfig>
  );
}

function ScrollProgress({ profile }: { readonly profile: MotionProfile }) {
  const shouldReduce = useReducedMotion();
  const { scrollYProgress } = useScroll();
  const progress = useSpring(scrollYProgress, {
    stiffness: profile === "operations" ? 280 : 190,
    damping: profile === "operations" ? 42 : 34,
    mass: 0.5,
    skipInitialAnimation: true,
  });

  return (
    <m.div
      className="csa-motion-progress"
      data-csa-motion-owner="motion"
      data-csa-motion-profile={profile}
      style={{ scaleX: shouldReduce ? 0 : progress }}
      aria-hidden="true"
    />
  );
}

export function MotionLift({
  children,
  className,
  strength = "subtle",
  static: isStatic = false,
}: {
  readonly children: ReactNode;
  readonly className?: string;
  readonly strength?: "subtle" | "expressive";
  /** Disable spatial hover/tap motion when stillness better serves the task. */
  readonly static?: boolean;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const pointerInsideRef = useRef(false);
  const pointerPressedRef = useRef(false);
  const shouldReduce = useReducedMotion();
  const hasFinePointer = useFinePointer();
  const isDocumentVisible = useDocumentVisible();
  const isInViewport = useElementInViewport(rootRef);
  const pointerX = useMotionValue(0.5);
  const pointerY = useMotionValue(0.5);
  const liftYTarget = useMotionValue(0);
  const liftScaleTarget = useMotionValue(1);
  const maxTilt = strength === "expressive" ? 1.6 : 0.75;
  const rotateXTarget = useTransform(pointerY, [0, 1], [maxTilt, -maxTilt]);
  const rotateYTarget = useTransform(pointerX, [0, 1], [-maxTilt, maxTilt]);
  const rotateX = useSpring(rotateXTarget, motionTokens.spring.ambient);
  const rotateY = useSpring(rotateYTarget, motionTokens.spring.ambient);
  const liftY = useSpring(liftYTarget, motionTokens.spring.press);
  const liftScale = useSpring(liftScaleTarget, motionTokens.spring.press);
  const activeEnvironment = isDocumentVisible && isInViewport;
  const allowsMotion = shouldReduce !== true && !isStatic && activeEnvironment;
  const allowsSpatialMotion =
    !isStatic &&
    allowsSpatialPointerResponse({
      documentVisible: isDocumentVisible,
      finePointer: hasFinePointer,
      inViewport: isInViewport,
      reducedMotion: shouldReduce === true,
    });

  const resetResponse = useCallback(
    (immediate: boolean) => {
      pointerInsideRef.current = false;
      pointerPressedRef.current = false;

      if (immediate) {
        pointerX.jump(0.5);
        pointerY.jump(0.5);
        rotateX.jump(0);
        rotateY.jump(0);
        liftYTarget.jump(0);
        liftScaleTarget.jump(1);
        liftY.jump(0);
        liftScale.jump(1);
        return;
      }

      pointerX.set(0.5);
      pointerY.set(0.5);
      liftYTarget.set(0);
      liftScaleTarget.set(1);
    },
    [liftScale, liftScaleTarget, liftY, liftYTarget, pointerX, pointerY, rotateX, rotateY],
  );
  const applyHoverResponse = useCallback(() => {
    if (!allowsSpatialMotion || pointerPressedRef.current) return;
    liftYTarget.set(strength === "expressive" ? -7 : -4);
    liftScaleTarget.set(strength === "expressive" ? 1.006 : 1.003);
  }, [allowsSpatialMotion, liftScaleTarget, liftYTarget, strength]);

  useEffect(() => {
    if (!allowsMotion || !allowsSpatialMotion) resetResponse(true);
  }, [allowsMotion, allowsSpatialMotion, resetResponse]);

  useEffect(() => {
    if (!allowsMotion) {
      resetResponse(true);
      return;
    }

    const handleWindowBlur = () => resetResponse(true);
    const handlePointerCancel = () => resetResponse(true);
    const handlePointerUp = () => {
      if (!pointerPressedRef.current) return;
      pointerPressedRef.current = false;
      if (pointerInsideRef.current && allowsSpatialMotion) applyHoverResponse();
      else resetResponse(false);
    };

    window.addEventListener("blur", handleWindowBlur);
    window.addEventListener("pointercancel", handlePointerCancel);
    window.addEventListener("pointerup", handlePointerUp);
    return () => {
      window.removeEventListener("blur", handleWindowBlur);
      window.removeEventListener("pointercancel", handlePointerCancel);
      window.removeEventListener("pointerup", handlePointerUp);
      resetResponse(true);
    };
  }, [allowsMotion, allowsSpatialMotion, applyHoverResponse, resetResponse]);

  const handleBlur = (event: ReactFocusEvent<HTMLDivElement>) => {
    const nextTarget = event.relatedTarget;
    if (nextTarget instanceof Node && event.currentTarget.contains(nextTarget)) return;
    resetResponse(true);
  };
  const handlePointerEnter = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!allowsSpatialMotion || event.pointerType !== "mouse") return;
    pointerInsideRef.current = true;
    applyHoverResponse();
  };
  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!allowsSpatialMotion || event.pointerType !== "mouse") return;
    const bounds = event.currentTarget.getBoundingClientRect();
    if (bounds.width === 0 || bounds.height === 0) return;
    pointerInsideRef.current = true;
    pointerX.set(Math.min(1, Math.max(0, (event.clientX - bounds.left) / bounds.width)));
    pointerY.set(Math.min(1, Math.max(0, (event.clientY - bounds.top) / bounds.height)));
    applyHoverResponse();
  };
  const handlePointerDown = () => {
    if (!allowsMotion) return;
    pointerPressedRef.current = true;
    liftYTarget.set(-1);
    liftScaleTarget.set(0.96);
  };
  const handlePointerUp = () => {
    pointerPressedRef.current = false;
    if (pointerInsideRef.current && allowsSpatialMotion) applyHoverResponse();
    else resetResponse(false);
  };

  return (
    <m.div
      className={["csa-motion-lift", className].filter(Boolean).join(" ")}
      data-csa-motion-owner="motion"
      onBlur={handleBlur}
      onLostPointerCapture={() => resetResponse(true)}
      onPointerCancel={() => resetResponse(true)}
      onPointerDown={handlePointerDown}
      onPointerEnter={handlePointerEnter}
      onPointerLeave={() => resetResponse(false)}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      ref={rootRef}
      style={
        allowsMotion
          ? {
              y: liftY,
              scale: liftScale,
              ...(allowsSpatialMotion
                ? {
                    transformPerspective: 1200,
                    rotateX,
                    rotateY,
                    transformStyle: "preserve-3d" as const,
                  }
                : {}),
            }
          : undefined
      }
    >
      {children}
    </m.div>
  );
}

function installScene(root: HTMLElement, profile: MotionProfile): ReturnType<typeof createScope> {
  // A surface can scope its authored scene so stable navigation and later
  // interactions remain outside the replayed targets. Operations surfaces
  // commonly use this inside a persistent shell; expressive public routes use
  // it to keep the one opening scene bounded to the hero.
  const sceneRoot = root.querySelector<HTMLElement>("[data-csa-motion-scene]") ?? root;

  return createScope({
    root: sceneRoot,
    defaults: {
      duration: motionTokens.duration.base,
      ease: motionTokens.easing.enter.anime,
    },
    mediaQueries: { reducedMotion: "(prefers-reduced-motion: reduce)" },
  }).add((scope) => {
    if (scope?.matches["reducedMotion"] === true) {
      root.dataset.csaMotionReady = "reduced";
      return;
    }

    root.dataset.csaMotionReady = "true";
    const cleanups: Array<() => void> = [];
    const ownerClaims = new Set<HTMLElement | SVGElement>();
    const query = <T extends Element = HTMLElement>(selector: string): T[] =>
      Array.from(sceneRoot.querySelectorAll<T>(selector));
    const claimAnime = <T extends HTMLElement | SVGElement>(elements: T[]): T[] =>
      elements.filter((element) => {
        const currentOwner = element.dataset.csaMotionOwner;
        if (currentOwner !== undefined && currentOwner !== "anime") {
          console.warn(
            `@csa/motion skipped an Anime.js effect already owned by ${currentOwner}.`,
            element,
          );
          return false;
        }
        if (currentOwner === undefined) {
          element.dataset.csaMotionOwner = "anime";
          ownerClaims.add(element);
        }
        return true;
      });

    const splitWords = query<HTMLElement>("[data-csa-motion-split]").flatMap((element) => {
      const splitter = splitText(element, {
        words: { class: "csa-motion-word", wrap: "hidden" },
        accessible: true,
      });
      return claimAnime(splitter.words as HTMLElement[]);
    });
    const headers = claimAnime(query<HTMLElement>('[data-csa-motion-enter="header"]'));
    const rises = claimAnime(query<HTMLElement>('[data-csa-motion-enter="rise"]'));
    const slides = claimAnime(query<HTMLElement>('[data-csa-motion-enter="slide"]'));
    const scales = claimAnime(query<HTMLElement>('[data-csa-motion-enter="scale"]'));
    const timeline = createTimeline({
      defaults: { ease: motionTokens.easing.enter.anime },
    });

    if (headers.length > 0) {
      timeline.add(
        headers,
        {
          opacity: [0, 1],
          translateY: [-14, 0],
          duration: motionTokens.duration.base,
        },
        0,
      );
    }
    if (splitWords.length > 0) {
      timeline.add(
        splitWords,
        {
          opacity: [0, 1],
          translateY: ["105%", "0%"],
          rotate: [2, 0],
          delay: stagger(
            profile === "public" ? motionTokens.stagger.standard : motionTokens.stagger.tight,
          ),
          duration: profile === "public" ? motionTokens.duration.slow : motionTokens.duration.base,
        },
        motionTokens.stagger.standard,
      );
    }
    if (rises.length > 0) {
      timeline.add(
        rises,
        {
          opacity: [0, 1],
          translateY: [22, 0],
          delay: stagger(motionTokens.stagger.standard),
          duration: profile === "public" ? motionTokens.duration.slow : motionTokens.duration.base,
        },
        motionTokens.duration.fast,
      );
    }
    if (slides.length > 0) {
      timeline.add(
        slides,
        {
          opacity: [0, 1],
          translateX: [profile === "operations" ? -18 : 18, 0],
          delay: stagger(motionTokens.stagger.tight),
          duration: motionTokens.duration.base,
        },
        motionTokens.duration.instant,
      );
    }
    if (scales.length > 0) {
      timeline.add(
        scales,
        {
          opacity: [0, 1],
          scale: [0.965, 1],
          delay: stagger(motionTokens.stagger.standard),
          duration: motionTokens.duration.slow,
        },
        motionTokens.duration.fast,
      );
    }

    claimAnime(query<HTMLElement>("[data-csa-motion-scramble]")).forEach((element, index) => {
      animate(element, {
        innerHTML: scrambleText({
          chars: "uppercase",
          override: "_",
          cursor: "▮",
          revealRate: motionTokens.stagger.generous,
          settleDuration: motionTokens.duration.instant,
          seed: 84 + index,
        }),
        delay: motionTokens.duration.fast + index * motionTokens.stagger.standard,
      });
    });

    claimAnime(query<HTMLElement>('[data-csa-motion-stagger="scroll"]')).forEach((group) => {
      const children = claimAnime(Array.from(group.querySelectorAll<HTMLElement>(":scope > *")));
      if (children.length === 0) return;
      animate(children, {
        opacity: [0, 1],
        translateY: [26, 0],
        scale: [0.985, 1],
        delay: stagger(motionTokens.stagger.tight, { from: "first" }),
        duration: profile === "public" ? motionTokens.duration.slow : motionTokens.duration.base,
        autoplay: onScroll({
          target: group,
          enter: "bottom-=8% top",
          repeat: false,
        }),
      });
    });

    claimAnime(query<HTMLElement>("[data-csa-motion-reveal]")).forEach((element) => {
      const direction = element.dataset.csaMotionReveal;
      const fromTransform =
        direction === "left"
          ? "translate3d(-28px, 0, 0)"
          : direction === "right"
            ? "translate3d(28px, 0, 0)"
            : "translate3d(0, 28px, 0)";
      waapi.animate(element, {
        opacity: [0, 1],
        transform: [fromTransform, "translate3d(0, 0, 0)"],
        duration: profile === "public" ? motionTokens.duration.slow : motionTokens.duration.base,
        ease: motionTokens.easing.enter.css,
        persist: true,
        autoplay: onScroll({ target: element, enter: "bottom-=8% top", repeat: false }),
      });
    });

    claimAnime(query<SVGGeometryElement>("[data-csa-motion-draw]")).forEach((element, index) => {
      const drawable = createDrawable(element);
      animate(drawable, {
        draw: ["0 0", "0 1"],
        delay: index * motionTokens.stagger.tight,
        duration:
          profile === "public" ? motionTokens.duration.cinematic : motionTokens.duration.slow,
        ease: motionTokens.easing.enter.anime,
        autoplay: onScroll({
          target: element.closest("svg") ?? element,
          enter: "bottom-=6% top",
          repeat: false,
        }),
      });
    });

    claimAnime(query<HTMLElement>("[data-csa-motion-bars]")).forEach((chart) => {
      const bars = claimAnime(Array.from(chart.querySelectorAll<HTMLElement>(":scope > *")));
      if (bars.length === 0) return;
      animate(bars, {
        scaleY: [0, 1],
        opacity: [0.35, 0.9],
        transformOrigin: "50% 100%",
        delay: stagger(motionTokens.stagger.tight, { from: "first" }),
        duration: motionTokens.duration.slow,
        ease: motionTokens.easing.enter.anime,
        autoplay: onScroll({ target: chart, enter: "bottom-=4% top", repeat: false }),
      });
    });

    claimAnime(query<HTMLElement>("[data-csa-motion-number]")).forEach((element) => {
      const cleanup = animateNumber(element);
      if (cleanup !== null) cleanups.push(cleanup);
    });

    claimAnime(query<HTMLElement>("[data-csa-motion-pulse]")).forEach((element, index) => {
      const animation = animate(element, {
        scale: [1, 1.65, 1],
        opacity: [1, 0.48, 1],
        delay: index * motionTokens.duration.instant,
        duration: motionTokens.duration.cinematic * 2,
        loop: true,
        ease: "inOutSine",
        autoplay: false,
      });
      const observer = new IntersectionObserver(([entry]) => {
        if (entry?.isIntersecting === true) animation.play();
        else animation.pause();
      });
      observer.observe(element);
      cleanups.push(() => {
        observer.disconnect();
        animation.cancel();
      });
    });

    claimAnime(query<HTMLElement>("[data-csa-motion-orbit]")).forEach((element, index) => {
      const animation = animate(element, {
        rotate: index % 2 === 0 ? "1turn" : "-1turn",
        duration: motionTokens.duration.cinematic * (10 + index),
        loop: true,
        ease: "linear",
        autoplay: false,
      });
      const observer = new IntersectionObserver(([entry]) => {
        if (entry?.isIntersecting === true) animation.play();
        else animation.pause();
      });
      observer.observe(element);
      cleanups.push(() => {
        observer.disconnect();
        animation.cancel();
      });
    });

    claimAnime(query<HTMLElement>("[data-csa-motion-parallax]")).forEach((element) => {
      animate(element, {
        translateY: [-18, 18],
        ease: "linear",
        autoplay: onScroll({
          target: element.parentElement ?? element,
          enter: "bottom top",
          leave: "top bottom",
          sync: 0.85,
        }),
      });
    });

    claimAnime(query<HTMLElement>("[data-csa-motion-hover]")).forEach((element) => {
      cleanups.push(installAnimePointerResponse(element));
    });

    return () => {
      delete root.dataset.csaMotionReady;
      cleanups.forEach((cleanup) => cleanup());
      ownerClaims.forEach((element) => {
        if (element.dataset.csaMotionOwner === "anime") {
          delete element.dataset.csaMotionOwner;
        }
      });
    };
  });
}

function installAnimePointerResponse(element: HTMLElement): () => void {
  const finePointerQuery = window.matchMedia("(hover: hover) and (pointer: fine)");
  const reducedMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
  const spring = animeSpring({ mass: 0.7, stiffness: 240, damping: 20 });
  let inViewport = typeof IntersectionObserver === "undefined";
  let response: ReturnType<typeof createAnimatable> | null = null;
  let responseListenersAttached = false;

  const isAllowed = () =>
    allowsSpatialPointerResponse({
      documentVisible: document.visibilityState !== "hidden",
      finePointer: finePointerQuery.matches,
      inViewport,
      reducedMotion: reducedMotionQuery.matches,
    });
  const readControls = () => {
    const moveX = response?.x;
    const moveY = response?.y;
    const resize = response?.scale;
    return moveX === undefined || moveY === undefined || resize === undefined
      ? null
      : { moveX, moveY, resize };
  };
  const reset = () => {
    const controls = readControls();
    if (controls === null) return;
    controls.moveX(0);
    controls.moveY(0);
    controls.resize(1);
  };
  const handleMove = (event: PointerEvent) => {
    if (!isAllowed() || event.pointerType !== "mouse") return;
    const controls = readControls();
    if (controls === null) return;
    const bounds = element.getBoundingClientRect();
    if (bounds.width === 0 || bounds.height === 0) return;
    controls.moveX((event.clientX - (bounds.left + bounds.width / 2)) * 0.08);
    controls.moveY((event.clientY - (bounds.top + bounds.height / 2)) * 0.12);
    controls.resize(1.018);
  };
  const stopResponse = () => {
    if (responseListenersAttached) {
      element.removeEventListener("blur", handleHardReset);
      element.removeEventListener("focusout", handleFocusOut);
      element.removeEventListener("lostpointercapture", handleHardReset);
      element.removeEventListener("pointercancel", handleHardReset);
      element.removeEventListener("pointerleave", reset);
      element.removeEventListener("pointermove", handleMove);
      responseListenersAttached = false;
    }
    response?.revert();
    response = null;
  };
  const startResponse = () => {
    if (response !== null || responseListenersAttached || !isAllowed()) return;
    response = createAnimatable(element, {
      x: { duration: motionTokens.duration.base, ease: spring },
      y: { duration: motionTokens.duration.base, ease: spring },
      scale: { duration: motionTokens.duration.fast, ease: spring },
    });
    element.addEventListener("blur", handleHardReset);
    element.addEventListener("focusout", handleFocusOut);
    element.addEventListener("lostpointercapture", handleHardReset);
    element.addEventListener("pointercancel", handleHardReset);
    element.addEventListener("pointerleave", reset);
    element.addEventListener("pointermove", handleMove);
    responseListenersAttached = true;
  };
  const syncResponse = () => {
    if (isAllowed()) startResponse();
    else stopResponse();
  };
  function handleHardReset(): void {
    const shouldRearm = isAllowed();
    stopResponse();
    if (shouldRearm) startResponse();
  }
  function handleFocusOut(event: FocusEvent): void {
    const nextTarget = event.relatedTarget;
    if (nextTarget instanceof Node && element.contains(nextTarget)) return;
    handleHardReset();
  }

  const handleVisibilityChange = () => syncResponse();
  const handleWindowBlur = () => handleHardReset();
  finePointerQuery.addEventListener("change", syncResponse);
  reducedMotionQuery.addEventListener("change", syncResponse);
  document.addEventListener("visibilitychange", handleVisibilityChange);
  window.addEventListener("blur", handleWindowBlur);

  let observer: IntersectionObserver | null = null;
  if (typeof IntersectionObserver !== "undefined") {
    observer = new IntersectionObserver(([entry]) => {
      inViewport = entry?.isIntersecting === true;
      syncResponse();
    });
    observer.observe(element);
  }
  syncResponse();

  return () => {
    finePointerQuery.removeEventListener("change", syncResponse);
    reducedMotionQuery.removeEventListener("change", syncResponse);
    document.removeEventListener("visibilitychange", handleVisibilityChange);
    window.removeEventListener("blur", handleWindowBlur);
    observer?.disconnect();
    stopResponse();
  };
}

function animateNumber(element: HTMLElement): (() => void) | null {
  const original = element.textContent ?? "";
  const match = original.match(/-?\d[\d,.]*/);
  if (match === null) return null;

  const rawNumber = match[0];
  const target = Number(rawNumber.replaceAll(",", ""));
  if (!Number.isFinite(target)) return null;

  const decimalPoint = rawNumber.lastIndexOf(".");
  const decimals = decimalPoint === -1 ? 0 : rawNumber.length - decimalPoint - 1;
  const formatter = new Intl.NumberFormat("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
    useGrouping: rawNumber.includes(","),
  });
  const state = { value: 0 };

  const animation = animate(state, {
    value: [0, target],
    duration: motionTokens.duration.cinematic,
    ease: motionTokens.easing.enter.anime,
    autoplay: onScroll({ target: element, enter: "bottom top", repeat: false }),
    onRender: () => {
      element.textContent = original.replace(rawNumber, formatter.format(state.value));
    },
    onComplete: () => {
      element.textContent = original;
    },
  });

  return () => {
    animation.cancel();
    element.textContent = original;
  };
}

function useFinePointer(): boolean {
  return useSyncExternalStore(subscribeToFinePointer, readFinePointer, () => false);
}

function useDocumentVisible(): boolean {
  return useSyncExternalStore(subscribeToDocumentVisibility, readDocumentVisibility, () => true);
}

function useElementInViewport<T extends HTMLElement>(target: RefObject<T | null>): boolean {
  const [isInViewport, setIsInViewport] = useState(false);

  useEffect(() => {
    const element = target.current;
    if (element === null) return;
    if (typeof IntersectionObserver === "undefined") {
      setIsInViewport(true);
      return;
    }

    const observer = new IntersectionObserver(([entry]) => {
      setIsInViewport(entry?.isIntersecting === true);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [target]);

  return isInViewport;
}

function subscribeToFinePointer(onStoreChange: () => void): () => void {
  const query = window.matchMedia("(hover: hover) and (pointer: fine)");
  query.addEventListener("change", onStoreChange);
  return () => query.removeEventListener("change", onStoreChange);
}

function readFinePointer(): boolean {
  return window.matchMedia("(hover: hover) and (pointer: fine)").matches;
}

function subscribeToDocumentVisibility(onStoreChange: () => void): () => void {
  document.addEventListener("visibilitychange", onStoreChange);
  return () => document.removeEventListener("visibilitychange", onStoreChange);
}

function readDocumentVisibility(): boolean {
  return document.visibilityState !== "hidden";
}

function prefersReducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function resetCurtain(overlay: HTMLElement): void {
  overlay.classList.remove("is-active");
  overlay.style.transform = "translate3d(0, 101%, 0)";
  const line = overlay.querySelector<HTMLElement>(".csa-motion-curtain__line");
  const meta = overlay.querySelector<HTMLElement>(".csa-motion-curtain__meta");
  if (line !== null) line.style.removeProperty("transform");
  if (meta !== null) {
    meta.style.removeProperty("opacity");
    meta.style.removeProperty("transform");
  }
}

export { motionTokens };
export {
  allowsSpatialPointerResponse,
  isMotionProviderEffectEnabled,
  motionProviderEffects,
} from "./web-contract";
export type { MotionProviderEffect, MotionProviderEffects } from "./web-contract";
export { m, useMotionValue, useReducedMotion, useScroll, useSpring, useTransform };
export {
  AnimatePresence,
  LayoutGroup,
  MotionConfig,
  MotionValue,
  Reorder,
  useAnimate,
  useAnimateMini,
  useAnimationControls,
  useAnimationFrame,
  useCycle,
  useDragControls,
  useInView,
  useIsPresent,
  useMotionTemplate,
  useMotionValueEvent,
  usePageInView,
  usePresence,
  usePresenceData,
  useTime,
  useVelocity,
  useWillChange,
} from "motion/react";
export {
  animate as motionAnimate,
  animateMini as motionAnimateMini,
  hover as motionHover,
  inView as motionInView,
  press as motionPress,
  scroll as motionScroll,
  spring as motionSpring,
  stagger as motionStagger,
  transform as motionTransform,
} from "motion/react";

// Low-level Anime.js capabilities stay behind the CSA web boundary. Product
// apps do not import either vendor directly.
export { animate } from "animejs/animation";
export { createAnimatable } from "animejs/animatable";
export { createDraggable } from "animejs/draggable";
export { engine } from "animejs/engine";
export { createSpring, cubicBezier, irregular, steps } from "animejs/easings";
export { onScroll } from "animejs/events";
export { createLayout } from "animejs/layout";
export { createScope } from "animejs/scope";
export { createDrawable, createMotionPath, morphTo } from "animejs/svg";
export { scrambleText, splitText } from "animejs/text";
export { createTimeline } from "animejs/timeline";
export { createTimer } from "animejs/timer";
export * as animeUtils from "animejs/utils";
export { stagger } from "animejs/utils";
export { waapi } from "animejs/waapi";
