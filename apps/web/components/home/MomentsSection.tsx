import { ArrowUpRight } from "lucide-react";
import Image from "next/image";

import { assetPath } from "@/lib/site-path";

import styles from "./Home.module.css";

const moments = [
  {
    title: "Back to 2016",
    note: "A night shaped by nostalgia",
    image: "/images/back-to-2016.webp" as const,
    className: styles.momentWide,
  },
  {
    title: "The art of pulling",
    note: "La Mian made from scratch",
    image: "/images/la-mian.webp" as const,
    className: styles.momentTall,
  },
  {
    title: "Give fortune, get fortune",
    note: "Dinner, community and purpose",
    image: "/images/gfgf-2026.webp" as const,
    className: styles.momentSquare,
  },
  {
    title: "Crazy Rich Asians Gala",
    note: "One bright shared evening",
    image: "/images/gala.webp" as const,
    className: styles.momentWide,
  },
] as const;

export function MomentsSection() {
  return (
    <section
      className={styles.moments}
      id="moments"
      aria-labelledby="moments-title"
      data-section-reveal
    >
      <div className={styles.momentsHeading}>
        <div>
          <p className={styles.sectionLabel}>
            <span>03</span> Shared moments
          </p>
          <h2 className={styles.sectionTitle} id="moments-title">
            The kind of memories that <em>make a city feel like home.</em>
          </h2>
        </div>
        <div className={styles.momentsMeta}>
          <p>Public CSA event archive · retrieved August 2026</p>
          <a className={styles.textLink} href="https://csa-rotterdam.nl/past-events/">
            Browse past events <ArrowUpRight aria-hidden size={18} />
          </a>
        </div>
      </div>

      <div className={styles.momentsGrid}>
        {moments.map((moment, index) => (
          <a
            className={`${styles.momentCard} ${moment.className}`}
            href="https://csa-rotterdam.nl/past-events/"
            key={moment.title}
          >
            <Image
              className={styles.momentImage}
              src={assetPath(moment.image)}
              fill
              sizes="(max-width: 700px) 92vw, (max-width: 1100px) 47vw, 31vw"
              alt={`${moment.title} at CSA Rotterdam`}
              style={{ objectFit: "cover" }}
            />
            <span className={styles.momentShade} aria-hidden />
            <span className={styles.momentIndex}>0{index + 1}</span>
            <span className={styles.momentCaption}>
              <strong>{moment.title}</strong>
              <span>{moment.note}</span>
            </span>
            <span className={styles.momentArrow} aria-hidden>
              <ArrowUpRight />
            </span>
          </a>
        ))}
      </div>
    </section>
  );
}
