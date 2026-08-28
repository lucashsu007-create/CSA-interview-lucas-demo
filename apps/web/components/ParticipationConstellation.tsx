"use client";

import { m, motionTokens, useReducedMotion } from "@csa/motion/web";
import {
  ArrowRight,
  BriefcaseBusiness,
  GraduationCap,
  Sparkles,
  Users,
  UtensilsCrossed,
} from "lucide-react";
import Image from "next/image";
import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";

import { assetPath } from "@/lib/site-path";

import styles from "./ParticipationConstellation.module.css";

// Every image below is an existing, source-tracked asset from public/images/SOURCES.md.
const participationPaths = [
  {
    id: "social",
    index: "01",
    label: "Social",
    summary: "Meet people through shared events.",
    proofLabel: "Photo evidence · Students in conversation",
    description:
      "Explore the social side of CSA through shared events. This sourced scene documents students taking part in a structured conversation format.",
    ctaLabel: "See an event snapshot",
    href: "#event",
    image: assetPath("/images/meetcha.webp"),
    imageAlt: "Students seated across a table in conversation at a CSA event",
    sourceLabel: "CSA public-site snapshot · March 2026",
    imageFit: "cover",
    icon: Users,
    networkPath: "M 286 72 C 370 72 366 282 452 282",
  },
  {
    id: "culture",
    index: "02",
    label: "Culture",
    summary: "Practice traditions, games, and food together.",
    proofLabel: "Photo evidence · Students around a mahjong table",
    description:
      "Explore shared games, food and cultural practice through CSA event formats. The photograph records one student gathering without claiming an outcome.",
    ctaLabel: "Browse the event archive",
    href: "https://csa-rotterdam.nl/past-events/",
    image: assetPath("/images/karaoke.webp"),
    imageAlt: "Students gathered around a mahjong table at a CSA event",
    sourceLabel: "CSA public-site snapshot · January 2026",
    imageFit: "cover",
    icon: UtensilsCrossed,
    networkPath: "M 286 212 C 372 212 370 282 452 282",
  },
  {
    id: "learn",
    index: "03",
    label: "Learn",
    summary: "Learn through workshops and explore the public course page.",
    proofLabel: "Photo evidence · Hands-on food preparation",
    description:
      "Learn through practical workshops and explore language-course information on CSA’s official site, where current availability can be confirmed.",
    ctaLabel: "Check course availability",
    href: "https://csa-rotterdam.nl/language-courses/",
    image: assetPath("/images/la-mian.webp"),
    imageAlt: "Students preparing food together during a hands-on CSA workshop",
    sourceLabel: "CSA public-site snapshot · May 2026",
    imageFit: "cover",
    icon: GraduationCap,
    networkPath: "M 286 352 C 372 352 370 282 452 282",
  },
  {
    id: "career",
    index: "04",
    label: "Career",
    summary: "Build student leadership and explore public opportunities.",
    proofLabel: "Photo evidence · 2025 CSA board portrait",
    description:
      "Explore student-leadership experience and opportunities published by CSA. This 2025 board photograph documents student leadership, not career outcomes or current office.",
    ctaLabel: "Visit the public jobs page",
    href: "https://csa-rotterdam.nl/jobs/",
    image: assetPath("/images/board-2025.webp"),
    imageAlt: "A formally dressed group posing together for a sourced CSA board portrait",
    sourceLabel: "CSA public-site upload · September 2025",
    imageFit: "contain",
    icon: BriefcaseBusiness,
    networkPath: "M 286 492 C 370 492 366 282 452 282",
  },
] as const;

type ParticipationPathId = (typeof participationPaths)[number]["id"];

const directTransition = { duration: 0, bounce: 0 } as const;

function pathFromHash(hash: string): ParticipationPathId {
  const slug = hash.startsWith("#participation-") ? hash.slice("#participation-".length) : "social";
  const matchedPath = participationPaths.find((path) => path.id === slug);
  return matchedPath?.id ?? "social";
}

function tabIdFor(pathId: ParticipationPathId): string {
  return `participation-tab-${pathId}`;
}

function hashIdFor(pathId: ParticipationPathId): string {
  return `participation-${pathId}`;
}

export function ParticipationConstellation() {
  const [selectedPathId, setSelectedPathId] = useState<ParticipationPathId>("social");
  const [animateSelection, setAnimateSelection] = useState(false);
  const [isEnhanced, setIsEnhanced] = useState(false);
  const reducedMotion = useReducedMotion() === true;
  const panelId = `${useId()}-participation-panel`;
  const instrumentRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const selectedPathRef = useRef<ParticipationPathId>("social");
  const motionEligibleRef = useRef(false);
  const activePath =
    participationPaths.find((path) => path.id === selectedPathId) ?? participationPaths[0];
  const ActivePathIcon = activePath.icon;
  const activeTabId = isEnhanced ? hashIdFor(activePath.id) : tabIdFor(activePath.id);
  const motionEnabled = animateSelection && !reducedMotion;

  const pathVariants = {
    initial: (shouldAnimate: boolean) =>
      shouldAnimate ? { opacity: 0, pathLength: 0 } : { opacity: 1, pathLength: 1 },
    visible: (shouldAnimate: boolean) => ({
      opacity: 1,
      pathLength: 1,
      transition: shouldAnimate ? motionTokens.spring.layout : directTransition,
    }),
  };

  const payloadVariants = {
    initial: (shouldAnimate: boolean) =>
      shouldAnimate ? { opacity: 0, x: 14, y: 8 } : { opacity: 1, x: 0, y: 0 },
    visible: (shouldAnimate: boolean) => ({
      opacity: 1,
      x: 0,
      y: 0,
      transition: shouldAnimate ? motionTokens.spring.layout : directTransition,
    }),
  };

  const replaceParticipationHash = (pathId: ParticipationPathId) => {
    const nextHash = `#${hashIdFor(pathId)}`;
    if (window.location.hash === nextHash) return;

    const nextUrl = new URL(window.location.href);
    nextUrl.hash = nextHash;
    window.history.replaceState(window.history.state, "", nextUrl.toString());
  };

  const selectPath = (pathId: ParticipationPathId, moveFocus = false) => {
    const changed = selectedPathRef.current !== pathId;
    selectedPathRef.current = pathId;
    setAnimateSelection(
      changed && motionEligibleRef.current && document.visibilityState === "visible",
    );
    setSelectedPathId(pathId);
    replaceParticipationHash(pathId);

    if (moveFocus) {
      const nextIndex = participationPaths.findIndex((path) => path.id === pathId);
      tabRefs.current[nextIndex]?.focus();
    }
  };

  const handleTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>, currentIndex: number) => {
    let nextIndex: number | null = null;

    switch (event.key) {
      case "ArrowRight":
      case "ArrowDown":
        nextIndex = (currentIndex + 1) % participationPaths.length;
        break;
      case "ArrowLeft":
      case "ArrowUp":
        nextIndex = (currentIndex - 1 + participationPaths.length) % participationPaths.length;
        break;
      case "Home":
        nextIndex = 0;
        break;
      case "End":
        nextIndex = participationPaths.length - 1;
        break;
      default:
        return;
    }

    const nextPath = participationPaths.at(nextIndex);
    if (!nextPath) return;

    event.preventDefault();
    selectPath(nextPath.id, true);
  };

  useEffect(() => {
    const instrument = instrumentRef.current;
    let isIntersecting = false;
    let isVisible = document.visibilityState === "visible";
    let focusFrame = 0;
    let enhancementFrame = 0;

    const resolveMotionEligibility = () => {
      const isEligible = isVisible && isIntersecting;
      motionEligibleRef.current = isEligible;
      if (!isEligible) setAnimateSelection(false);
    };

    const measureIntersection = () => {
      if (!instrument) return;
      const bounds = instrument.getBoundingClientRect();
      isIntersecting = bounds.bottom > 0 && bounds.top < window.innerHeight;
    };

    const reconcileFromHash = () => {
      const nextPathId = pathFromHash(window.location.hash);
      const selectionChanged = selectedPathRef.current !== nextPathId;
      const focusWasInPanel =
        selectionChanged && panelRef.current?.contains(document.activeElement);

      selectedPathRef.current = nextPathId;
      setAnimateSelection(false);
      setSelectedPathId(nextPathId);

      if (focusWasInPanel) {
        if (focusFrame !== 0) cancelAnimationFrame(focusFrame);
        focusFrame = requestAnimationFrame(() => {
          const nextIndex = participationPaths.findIndex((path) => path.id === nextPathId);
          tabRefs.current[nextIndex]?.focus();
          focusFrame = 0;
        });
      }
    };

    measureIntersection();
    resolveMotionEligibility();
    reconcileFromHash();

    const observer =
      instrument && "IntersectionObserver" in window
        ? new IntersectionObserver(
            ([entry]) => {
              isIntersecting = entry?.isIntersecting === true;
              resolveMotionEligibility();
            },
            { threshold: 0.08 },
          )
        : null;
    if (instrument) observer?.observe(instrument);

    const onVisibilityChange = () => {
      isVisible = document.visibilityState === "visible";
      if (isVisible) measureIntersection();
      resolveMotionEligibility();
      if (isVisible) reconcileFromHash();
    };
    const onPageShow = () => reconcileFromHash();
    const onRuntimeFailure = () => {
      motionEligibleRef.current = false;
      setAnimateSelection(false);
      setIsEnhanced(false);
    };

    window.addEventListener("hashchange", reconcileFromHash);
    window.addEventListener("pageshow", onPageShow);
    window.addEventListener("error", onRuntimeFailure);
    window.addEventListener("unhandledrejection", onRuntimeFailure);
    document.addEventListener("visibilitychange", onVisibilityChange);
    setIsEnhanced(true);

    if (window.location.hash.startsWith("#participation-")) {
      enhancementFrame = requestAnimationFrame(() => {
        instrument?.scrollIntoView({ block: "start" });
        enhancementFrame = 0;
      });
    }

    return () => {
      observer?.disconnect();
      window.removeEventListener("hashchange", reconcileFromHash);
      window.removeEventListener("pageshow", onPageShow);
      window.removeEventListener("error", onRuntimeFailure);
      window.removeEventListener("unhandledrejection", onRuntimeFailure);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      if (focusFrame !== 0) cancelAnimationFrame(focusFrame);
      if (enhancementFrame !== 0) cancelAnimationFrame(enhancementFrame);
      motionEligibleRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (reducedMotion) setAnimateSelection(false);
  }, [reducedMotion]);

  return (
    <section
      className={styles.section}
      id="participation"
      aria-labelledby="participation-title"
      data-enhanced={isEnhanced ? "true" : "false"}
    >
      <div className={styles.shell}>
        <div className={styles.intro}>
          <div>
            <p className={styles.eyebrow}>
              <span>02</span>
              <span aria-hidden className={styles.eyebrowLine} />
              Participation constellation
            </p>
            <h2 className={styles.title} id="participation-title">
              Find the way you want to <span>take part.</span>
            </h2>
          </div>
          <p className={styles.lede}>
            CSA is one connected community with four ways in. Explore a path to see the sourced
            moment, what it offers and where to go next.
          </p>
        </div>

        <div ref={instrumentRef} className={styles.instrument} data-active-path={selectedPathId}>
          <div className={styles.instrumentBar}>
            <p>
              <span className={styles.statusDot} aria-hidden />
              Participation signal
            </p>
            <p className={styles.instrumentMeta}>
              <span>04 participation paths</span>
              <span aria-hidden>RTM · NL</span>
            </p>
          </div>

          <div className={styles.instrumentBody}>
            <div className={styles.selectorRegion}>
              <svg
                className={styles.network}
                viewBox="0 0 500 564"
                preserveAspectRatio="none"
                aria-hidden="true"
              >
                {participationPaths.map((path) => (
                  <path
                    key={path.id}
                    className={styles.networkPath}
                    d={path.networkPath}
                    fill="none"
                  />
                ))}
                <m.path
                  key={activePath.id}
                  className={styles.activeNetworkPath}
                  d={activePath.networkPath}
                  fill="none"
                  custom={motionEnabled}
                  variants={pathVariants}
                  initial="initial"
                  animate="visible"
                />
                <circle className={styles.networkCoreOuter} cx="452" cy="282" r="25" />
                <circle className={styles.networkCoreInner} cx="452" cy="282" r="7" />
              </svg>

              <div className={styles.hubLabel} aria-hidden>
                <Sparkles size={15} />
                <span>One CSA</span>
              </div>

              <div
                className={styles.pathList}
                role="tablist"
                aria-label="Choose a participation path"
              >
                {participationPaths.map((path, index) => {
                  const PathIcon = path.icon;
                  const isSelected = selectedPathId === path.id;

                  return (
                    <button
                      key={path.id}
                      ref={(node) => {
                        tabRefs.current[index] = node;
                      }}
                      id={isEnhanced ? hashIdFor(path.id) : tabIdFor(path.id)}
                      className={styles.pathButton}
                      role="tab"
                      type="button"
                      aria-controls={panelId}
                      aria-selected={isSelected}
                      tabIndex={isSelected ? 0 : -1}
                      data-selected={isSelected}
                      onClick={() => selectPath(path.id, true)}
                      onKeyDown={(event) => handleTabKeyDown(event, index)}
                    >
                      <span className={styles.pathIndex}>{path.index}</span>
                      <span className={styles.pathCopy}>
                        <strong>{path.label}</strong>
                        <span>{path.summary}</span>
                      </span>
                      <span className={styles.pathIcon} aria-hidden="true">
                        <PathIcon size={19} strokeWidth={1.9} />
                      </span>
                      <span className={styles.committedMark} aria-hidden="true" />
                    </button>
                  );
                })}
              </div>
            </div>

            <div
              ref={panelRef}
              className={styles.payloadStack}
              id={panelId}
              role="tabpanel"
              aria-labelledby={activeTabId}
            >
              <m.article
                key={activePath.id}
                className={styles.detailPayload}
                custom={motionEnabled}
                variants={payloadVariants}
                initial="initial"
                animate="visible"
              >
                <div className={styles.photo} data-fit={activePath.imageFit}>
                  <Image
                    className={styles.photoImage}
                    src={activePath.image}
                    fill
                    sizes="(max-width: 960px) 92vw, (max-width: 1280px) 52vw, 690px"
                    alt={activePath.imageAlt}
                  />
                  <div className={styles.photoMeta}>
                    <span>{activePath.sourceLabel}</span>
                    <span aria-hidden>
                      {activePath.index} / {String(participationPaths.length).padStart(2, "0")}
                    </span>
                  </div>
                </div>

                <div className={styles.detailCopy}>
                  <p className={styles.purposeLabel}>
                    <span aria-hidden />
                    {activePath.proofLabel}
                  </p>
                  <div className={styles.detailHeading}>
                    <div>
                      <p>Selected path</p>
                      <h3>{activePath.label}</h3>
                    </div>
                    <ActivePathIcon aria-hidden size={30} strokeWidth={1.65} />
                  </div>
                  <p className={styles.description}>{activePath.description}</p>
                  <a className={styles.cta} href={activePath.href}>
                    {activePath.ctaLabel}
                    <ArrowRight aria-hidden size={18} />
                  </a>
                </div>
              </m.article>
            </div>
          </div>
        </div>

        <div className={styles.noScriptFallback} aria-label="Participation paths">
          <p className={styles.noScriptTitle}>Four ways to participate</p>
          <ol>
            {participationPaths.map((path) => (
              <li key={path.id} id={isEnhanced ? undefined : hashIdFor(path.id)}>
                <article>
                  <div className={styles.noScriptHeading}>
                    <span>{path.index}</span>
                    <h3>{path.label}</h3>
                  </div>
                  <p>{path.summary}</p>
                  <div className={styles.noScriptPhoto} data-fit={path.imageFit}>
                    <Image
                      className={styles.photoImage}
                      src={path.image}
                      fill
                      sizes="(max-width: 620px) 92vw, 44vw"
                      alt={path.imageAlt}
                    />
                  </div>
                  <p>{path.proofLabel}</p>
                  <p>{path.sourceLabel}</p>
                  <p>{path.description}</p>
                  <a href={path.href}>{path.ctaLabel}</a>
                </article>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}
