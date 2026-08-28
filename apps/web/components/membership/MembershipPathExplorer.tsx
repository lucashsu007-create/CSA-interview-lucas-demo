"use client";

import { m, motionTokens, useReducedMotion } from "@csa/motion/web";
import { ArrowRight, Languages, TicketCheck } from "lucide-react";
import Image from "next/image";
import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";

import { assetPath } from "@/lib/site-path";

import styles from "./Membership.module.css";

const membershipPaths = [
  {
    id: "general",
    index: "01",
    label: "General",
    shortLabel: "Events + partners",
    eyebrow: "Community membership",
    title: "A starting point for the wider CSA experience.",
    description:
      "CSA’s public membership page describes discounts at selected restaurant partners and CSA events.",
    benefits: ["Restaurant-partner discounts", "Discounts at eligible CSA events"],
    caveat:
      "Current price, term, participating partners and eligible events are not verified here.",
    image: assetPath("/images/csa-membership-artwork.webp"),
    imageAlt: "Red CSA EUR membership promotional artwork",
    imageLabel: "Public membership-page artwork · rights pending",
    imageFit: "contain",
    href: "https://membership.csa-rotterdam.nl/",
    cta: "Check official membership status",
    icon: TicketCheck,
  },
  {
    id: "premium",
    index: "02",
    label: "Premium",
    shortLabel: "Language + general",
    eyebrow: "Language-course membership",
    title: "A learning path with General Membership included.",
    description:
      "CSA’s public membership page describes Mandarin or Dutch language courses, General Membership included, and additional cultural-event discounts.",
    benefits: [
      "Mandarin or Dutch language-course path",
      "General Membership included",
      "Additional cultural-event discounts",
    ],
    caveat: "Course dates, levels, capacity, price and term are not verified in this concept.",
    image: assetPath("/images/membership-education.webp"),
    imageAlt: "Participants practising Chinese calligraphy at a workshop",
    imageLabel: "Public membership-page education image · rights pending",
    imageFit: "cover",
    href: "https://csa-rotterdam.nl/language-courses/",
    cta: "View official course information",
    icon: Languages,
  },
] as const;

type MembershipPathId = (typeof membershipPaths)[number]["id"];

function pathFromHash(hash: string): MembershipPathId {
  const slug = hash.startsWith("#membership-") ? hash.slice("#membership-".length) : "general";
  return membershipPaths.find((path) => path.id === slug)?.id ?? "general";
}

function tabId(id: MembershipPathId): string {
  return `membership-path-tab-${id}`;
}

export function MembershipPathExplorer() {
  const [selectedId, setSelectedId] = useState<MembershipPathId>("general");
  const [enhanced, setEnhanced] = useState(false);
  const [animateSelection, setAnimateSelection] = useState(false);
  const reducedMotion = useReducedMotion() === true;
  const panelId = `${useId()}-membership-path-panel`;
  const selectorLabelId = `${useId()}-membership-path-selector-label`;
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const selectedPath = membershipPaths.find((path) => path.id === selectedId) ?? membershipPaths[0];
  const SelectedIcon = selectedPath.icon;

  const selectPath = (id: MembershipPathId, moveFocus = false) => {
    const changed = id !== selectedId;
    setAnimateSelection(changed && !reducedMotion && document.visibilityState === "visible");
    setSelectedId(id);

    const nextUrl = new URL(window.location.href);
    nextUrl.hash = `membership-${id}`;
    window.history.replaceState(window.history.state, "", nextUrl.toString());

    if (moveFocus) {
      const nextIndex = membershipPaths.findIndex((path) => path.id === id);
      tabRefs.current[nextIndex]?.focus();
    }
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>, currentIndex: number) => {
    let nextIndex: number | null = null;

    switch (event.key) {
      case "ArrowRight":
      case "ArrowDown":
        nextIndex = (currentIndex + 1) % membershipPaths.length;
        break;
      case "ArrowLeft":
      case "ArrowUp":
        nextIndex = (currentIndex - 1 + membershipPaths.length) % membershipPaths.length;
        break;
      case "Home":
        nextIndex = 0;
        break;
      case "End":
        nextIndex = membershipPaths.length - 1;
        break;
      default:
        return;
    }

    const nextPath = membershipPaths.at(nextIndex);
    if (!nextPath) return;
    event.preventDefault();
    selectPath(nextPath.id, true);
  };

  useEffect(() => {
    const reconcileFromHash = () => {
      setAnimateSelection(false);
      setSelectedId(pathFromHash(window.location.hash));
    };
    const restoreStaticFallback = () => {
      setAnimateSelection(false);
      setEnhanced(false);
    };

    reconcileFromHash();
    setEnhanced(true);
    window.addEventListener("hashchange", reconcileFromHash);
    window.addEventListener("error", restoreStaticFallback);
    window.addEventListener("unhandledrejection", restoreStaticFallback);
    return () => {
      window.removeEventListener("hashchange", reconcileFromHash);
      window.removeEventListener("error", restoreStaticFallback);
      window.removeEventListener("unhandledrejection", restoreStaticFallback);
    };
  }, []);

  useEffect(() => {
    if (reducedMotion) setAnimateSelection(false);
  }, [reducedMotion]);

  return (
    <div className={styles.pathExplorer} data-enhanced={enhanced ? "true" : "false"}>
      <div className={styles.pathInstrument} aria-label="Compare membership paths">
        <div className={styles.instrumentHeader}>
          <p>
            <span className={styles.liveDot} aria-hidden />
            Membership pathfinder
          </p>
          <p>Public-page summary · checked 27 Aug 2026</p>
        </div>

        <div className={styles.instrumentBody}>
          <div className={styles.pathSelector}>
            <p className={styles.selectorPrompt} id={selectorLabelId}>
              What do you want membership to unlock?
            </p>
            <div className={styles.pathTabs} role="tablist" aria-labelledby={selectorLabelId}>
              {membershipPaths.map((path, index) => {
                const PathIcon = path.icon;
                const selected = path.id === selectedId;

                return (
                  <button
                    ref={(node) => {
                      tabRefs.current[index] = node;
                    }}
                    className={styles.pathTab}
                    data-selected={selected ? "true" : "false"}
                    id={tabId(path.id)}
                    key={path.id}
                    role="tab"
                    type="button"
                    aria-controls={panelId}
                    aria-selected={selected}
                    tabIndex={selected ? 0 : -1}
                    onClick={() => selectPath(path.id)}
                    onKeyDown={(event) => handleKeyDown(event, index)}
                  >
                    <span className={styles.pathIndex}>{path.index}</span>
                    <span className={styles.pathTabCopy}>
                      <strong>{path.label}</strong>
                      <small>{path.shortLabel}</small>
                    </span>
                    <PathIcon aria-hidden size={21} />
                  </button>
                );
              })}
            </div>
            <p className={styles.selectorNote}>Use arrow keys to compare both paths.</p>
          </div>

          <m.div
            className={styles.pathPanel}
            id={panelId}
            key={selectedPath.id}
            role="tabpanel"
            aria-labelledby={tabId(selectedPath.id)}
            initial={animateSelection ? { opacity: 0, x: 18, scale: 0.992 } : false}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            transition={animateSelection ? motionTokens.spring.layout : { duration: 0, bounce: 0 }}
          >
            <figure className={styles.pathMedia}>
              <Image
                src={selectedPath.image}
                fill
                sizes="(max-width: 760px) 92vw, (max-width: 1120px) 54vw, 48vw"
                alt={selectedPath.imageAlt}
                style={{ objectFit: selectedPath.imageFit }}
              />
              <figcaption>{selectedPath.imageLabel}</figcaption>
            </figure>

            <article className={styles.pathPayload}>
              <p className={styles.pathEyebrow}>
                <SelectedIcon aria-hidden size={17} />
                {selectedPath.eyebrow}
              </p>
              <h3>{selectedPath.title}</h3>
              <p className={styles.pathDescription}>{selectedPath.description}</p>
              <ul>
                {selectedPath.benefits.map((benefit) => (
                  <li key={benefit}>{benefit}</li>
                ))}
              </ul>
              <p className={styles.pathCaveat}>{selectedPath.caveat}</p>
              <a className={styles.pathCta} href={selectedPath.href}>
                {selectedPath.cta} <ArrowRight aria-hidden size={18} />
              </a>
            </article>
          </m.div>
        </div>
      </div>

      <div className={styles.pathFallback} aria-label="Membership paths">
        {membershipPaths.map((path) => {
          const PathIcon = path.icon;
          return (
            <article className={styles.fallbackCard} id={`membership-${path.id}`} key={path.id}>
              <figure className={styles.fallbackMedia}>
                <Image
                  src={path.image}
                  fill
                  sizes="(max-width: 760px) 92vw, 45vw"
                  alt={path.imageAlt}
                  style={{ objectFit: path.imageFit }}
                />
                <figcaption>{path.imageLabel}</figcaption>
              </figure>
              <div>
                <p className={styles.pathEyebrow}>
                  <PathIcon aria-hidden size={17} />
                  {path.label} Membership
                </p>
                <h3>{path.title}</h3>
                <p>{path.description}</p>
                <p className={styles.pathCaveat}>{path.caveat}</p>
                <a className={styles.pathCta} href={path.href}>
                  {path.cta} <ArrowRight aria-hidden size={18} />
                </a>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
