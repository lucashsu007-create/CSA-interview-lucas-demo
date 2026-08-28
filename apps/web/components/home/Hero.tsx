import { ArrowDown, ArrowUpRight } from "lucide-react";
import Image from "next/image";

import { assetPath } from "@/lib/site-path";

import styles from "./Home.module.css";

export function Hero() {
  return (
    <section className={styles.hero} id="top" aria-labelledby="hero-title" data-csa-motion-scene>
      <div className={styles.heroGrid}>
        <div className={styles.heroCopy}>
          <p className={styles.conceptLabel}>Independent experience concept</p>

          <p className={styles.heroEyebrow} data-csa-motion-enter="rise">
            Chinese Student Association · Erasmus University Rotterdam
          </p>

          <h1 className={styles.heroTitle} id="hero-title">
            <span data-csa-motion-split>Come for the culture.</span>
            <span className={styles.heroTitleAccent} data-csa-motion-split>
              Stay for the people.
            </span>
          </h1>

          <p className={styles.heroLede} data-csa-motion-enter="rise">
            A student-led community where Chinese, Dutch and international students meet through
            food, language, shared experiences and opportunity—right in the heart of Rotterdam.
          </p>

          <div className={styles.heroActions} data-csa-motion-enter="rise">
            <a className={styles.primaryButton} href="#participation">
              Find your way in <ArrowDown aria-hidden size={18} />
            </a>
            <a className={styles.textLink} href="https://csa-rotterdam.nl/about/">
              Meet CSA <ArrowUpRight aria-hidden size={18} />
            </a>
          </div>
        </div>

        <div className={styles.heroVisual} data-csa-motion-enter="scale">
          <svg
            className={styles.heroConnections}
            viewBox="0 0 720 760"
            fill="none"
            aria-hidden="true"
          >
            <path d="M51 543C123 366 189 294 343 274C475 257 561 179 657 50" />
            <path d="M78 628C237 612 300 570 376 479C471 365 564 358 684 385" />
          </svg>

          <div className={styles.heroStage}>
            <span className={styles.heroStageWord} aria-hidden>
              CSA
            </span>
            <div className={styles.heroStageMeta}>
              <span>Public-site image · 2025 board</span>
              <span>Concept use · rights pending</span>
            </div>
            <div className={styles.boardImage}>
              <Image
                src={assetPath("/images/board-2025.webp")}
                fill
                preload
                loading="eager"
                sizes="(max-width: 760px) 92vw, (max-width: 1100px) 55vw, 47vw"
                alt="People shown in CSA Rotterdam's public 2025 board portrait"
                style={{ objectFit: "contain", objectPosition: "center bottom" }}
              />
            </div>
          </div>

          <div className={styles.heroSnapshot}>
            <div className={styles.heroSnapshotImage}>
              <Image
                src={assetPath("/images/meetcha.webp")}
                fill
                sizes="(max-width: 760px) 38vw, 190px"
                alt="Students meeting at a CSA Rotterdam social"
                style={{ objectFit: "cover" }}
              />
            </div>
            <span>Meetcha · public-site snapshot</span>
          </div>

          <div className={styles.heroStamp} aria-hidden>
            <span>RTM</span>
            <small>51.9244° N</small>
          </div>
        </div>
      </div>

      <div className={styles.heroFooter} aria-label="CSA participation pillars">
        <span>Social</span>
        <i aria-hidden />
        <span>Culture</span>
        <i aria-hidden />
        <span>Learn</span>
        <i aria-hidden />
        <span>Career</span>
      </div>
    </section>
  );
}
