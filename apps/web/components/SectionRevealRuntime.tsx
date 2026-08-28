"use client";

import { useEffect } from "react";

const targetSelector = "[data-section-reveal]";

/**
 * Eligibility only: CSS owns the reveal properties. Server markup starts
 * visible, and this helper marks only below-fold groups as pending after
 * hydration. Completed groups unobserve and never replay.
 */
export function SectionRevealRuntime() {
  useEffect(() => {
    const targets = Array.from(document.querySelectorAll<HTMLElement>(targetSelector));
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let observer: IntersectionObserver | null = null;

    const reveal = (target: HTMLElement) => {
      if (target.dataset.sectionRevealState === "visible") return;
      target.dataset.sectionRevealState = "revealing";
      observer?.unobserve(target);
    };

    const resolveAll = () => {
      targets.forEach((target) => {
        target.dataset.sectionRevealState = "visible";
        observer?.unobserve(target);
      });
    };

    const installObserver = () => {
      observer?.disconnect();
      observer = null;

      if (reducedMotion.matches || document.visibilityState === "hidden") {
        resolveAll();
        return;
      }

      observer = new IntersectionObserver(
        (entries) => {
          if (document.visibilityState === "hidden") return;
          entries.forEach((entry) => {
            if (entry.isIntersecting) reveal(entry.target as HTMLElement);
          });
        },
        { rootMargin: "0px 0px -4%", threshold: 0.04 },
      );

      targets.forEach((target) => {
        if (target.getBoundingClientRect().top < window.innerHeight * 0.96) {
          target.dataset.sectionRevealState = "visible";
        } else {
          target.dataset.sectionRevealState = "pending";
          observer?.observe(target);
        }
      });
    };

    const onFocusIn = (event: FocusEvent) => {
      const focused = event.target;
      if (!(focused instanceof Element)) return;
      const target = focused.closest<HTMLElement>(targetSelector);
      if (target) {
        target.dataset.sectionRevealState = "visible";
        observer?.unobserve(target);
      }
    };

    const onTransitionEnd = (event: TransitionEvent) => {
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        target.matches(targetSelector) &&
        target.dataset.sectionRevealState === "revealing" &&
        event.propertyName === "opacity"
      ) {
        target.dataset.sectionRevealState = "visible";
      }
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") resolveAll();
    };

    const onPreferenceChange = () => {
      if (reducedMotion.matches) resolveAll();
    };

    installObserver();
    document.addEventListener("focusin", onFocusIn);
    document.addEventListener("transitionend", onTransitionEnd);
    document.addEventListener("visibilitychange", onVisibilityChange);
    reducedMotion.addEventListener("change", onPreferenceChange);

    return () => {
      observer?.disconnect();
      document.removeEventListener("focusin", onFocusIn);
      document.removeEventListener("transitionend", onTransitionEnd);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      reducedMotion.removeEventListener("change", onPreferenceChange);
      targets.forEach((target) => {
        delete target.dataset.sectionRevealState;
      });
    };
  }, []);

  return null;
}
