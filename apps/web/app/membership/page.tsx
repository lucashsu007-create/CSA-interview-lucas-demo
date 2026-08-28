import { ArrowDown, ArrowRight, ArrowUpRight, CircleCheck, ExternalLink } from "lucide-react";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";

import { MembershipPathExplorer } from "@/components/membership/MembershipPathExplorer";
import { SectionRevealRuntime } from "@/components/SectionRevealRuntime";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/home/SiteFooter";
import { assetPath } from "@/lib/site-path";

import styles from "@/components/membership/Membership.module.css";

export const metadata: Metadata = {
  title: "Membership — CSA Rotterdam Independent Concept",
  description:
    "A clearer independent concept for exploring CSA Rotterdam's General and Premium membership paths.",
  openGraph: {
    title: "Membership — CSA Rotterdam Independent Concept",
    description:
      "Compare the membership paths described on CSA Rotterdam's public website, then confirm current details with CSA.",
    images: [
      {
        url: assetPath("/images/membership-architecture-concept.webp"),
        width: 1536,
        height: 1024,
        alt: "Generated architectural study of Chinese roof forms against a contemporary skyline",
      },
    ],
  },
  robots: { index: false, follow: false },
};

const clarityItems = [
  {
    label: "What is represented",
    value: "The two paths and broad benefits described on CSA’s public membership page.",
  },
  {
    label: "What to confirm",
    value: "Current price, term, availability, eligibility, partners and course details.",
  },
  {
    label: "Where action happens",
    value: "On CSA’s official membership or language-course pages—not inside this concept.",
  },
] as const;

export default function MembershipPage() {
  return (
    <>
      <SiteHeader current="membership" />
      <main className={styles.page} id="main-content">
        <section
          className={styles.hero}
          id="top"
          aria-labelledby="membership-hero-title"
          data-csa-motion-scene
        >
          <div className={styles.heroBackdrop} data-csa-motion-enter="scale">
            <Image
              src={assetPath("/images/membership-architecture-concept.webp")}
              fill
              priority
              sizes="100vw"
              alt=""
              style={{ objectFit: "cover" }}
            />
          </div>
          <div className={styles.heroVeil} aria-hidden />

          <div className={styles.heroInner}>
            <div className={styles.heroCopy}>
              <p className={styles.conceptLabel} data-csa-motion-enter="header">
                Independent membership experience concept
              </p>
              <p className={styles.heroEyebrow} data-csa-motion-enter="rise">
                CSA Rotterdam · General + Premium
              </p>
              <h1 className={styles.heroTitle} id="membership-hero-title">
                <span data-csa-motion-split>Choose your way</span>
                <span className={styles.heroTitleAccent} data-csa-motion-split>
                  into CSA.
                </span>
              </h1>
              <p className={styles.heroLede} data-csa-motion-enter="rise">
                Compare the two paths in plain language, understand what still needs confirmation,
                and continue only when you are ready.
              </p>
              <div className={styles.heroActions} data-csa-motion-enter="rise">
                <a className={styles.primaryAction} href="#membership-options">
                  Compare the paths <ArrowDown aria-hidden size={19} />
                </a>
                <a className={styles.secondaryAction} href="https://membership.csa-rotterdam.nl/">
                  Check official status <ArrowUpRight aria-hidden size={18} />
                </a>
              </div>
              <p className={styles.mobileAssetDisclosure}>
                Generated editorial illustration · independent concept, not a CSA venue
              </p>
            </div>

            <div className={styles.heroRail} data-csa-motion-enter="rise">
              <div>
                <span>01</span>
                <strong>Understand</strong>
                <small>Two public membership paths</small>
              </div>
              <div>
                <span>02</span>
                <strong>Compare</strong>
                <small>Benefits without sales pressure</small>
              </div>
              <div>
                <span>03</span>
                <strong>Confirm</strong>
                <small>Current details with CSA</small>
              </div>
              <p>
                Generated editorial illustration
                <br />
                Independent concept · not a CSA venue
              </p>
            </div>
          </div>
        </section>

        <section
          className={styles.choiceSection}
          id="membership-options"
          aria-labelledby="membership-options-title"
        >
          <div className={styles.shell}>
            <div className={styles.sectionIntro} data-section-reveal>
              <div>
                <p className={styles.sectionLabel}>
                  <span>01</span>
                  Two ways in
                </p>
                <h2 id="membership-options-title">
                  One clear comparison.
                  <br />
                  <em>No checkout maze.</em>
                </h2>
              </div>
              <div className={styles.introCopy}>
                <p>
                  Start with what you want from membership. The pathfinder separates the public
                  offer descriptions from the details that still need confirmation.
                </p>
                <p className={styles.freshness}>
                  Based on CSA’s public membership page shared 27 August 2026.
                </p>
              </div>
            </div>

            <div data-section-reveal>
              <MembershipPathExplorer />
            </div>
          </div>
        </section>

        <section className={styles.claritySection} aria-labelledby="clarity-title">
          <div className={styles.shell}>
            <div className={styles.clarityGrid} data-section-reveal>
              <div className={styles.clarityLead}>
                <p className={`${styles.sectionLabel} ${styles.sectionLabelLight}`}>
                  <span>02</span>
                  Clarity before commitment
                </p>
                <h2 id="clarity-title">Know what is certain—and what to check.</h2>
                <p>
                  This concept explains the choice. It does not accept payments, reserve a place, or
                  activate a membership.
                </p>
              </div>

              <div className={styles.clarityList}>
                {clarityItems.map((item, index) => (
                  <article key={item.label}>
                    <span>0{index + 1}</span>
                    <div>
                      <h3>{item.label}</h3>
                      <p>{item.value}</p>
                    </div>
                    <CircleCheck aria-hidden size={22} />
                  </article>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className={styles.handoffSection} aria-labelledby="handoff-title">
          <div className={styles.shell}>
            <div className={styles.handoffCard} data-section-reveal>
              <div>
                <p className={styles.sectionLabel}>
                  <span>03</span>
                  Verified next step
                </p>
                <h2 id="handoff-title">Ready for the current details?</h2>
                <p>
                  Continue to CSA’s official pages for live availability, terms and any registration
                  steps.
                </p>
              </div>

              <div className={styles.handoffActions}>
                <a className={styles.officialAction} href="https://membership.csa-rotterdam.nl/">
                  Official membership service <ExternalLink aria-hidden size={18} />
                </a>
                <a
                  className={styles.courseAction}
                  href="https://csa-rotterdam.nl/language-courses/"
                >
                  Language-course information <ArrowRight aria-hidden size={18} />
                </a>
                <Link className={styles.homeAction} href="/">
                  Return to the CSA concept
                </Link>
              </div>
            </div>
          </div>
        </section>
      </main>
      <SiteFooter />
      <SectionRevealRuntime />
    </>
  );
}
