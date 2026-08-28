import { ArrowUpRight } from "lucide-react";
import Image from "next/image";

import { assetPath } from "@/lib/site-path";

import styles from "./Home.module.css";

export function StorySection() {
  return (
    <section className={styles.story} id="story" aria-labelledby="story-title" data-section-reveal>
      <div className={styles.sectionLead}>
        <p className={styles.sectionLabel}>
          <span>01</span> The feeling
        </p>
        <h2 className={styles.sectionTitle} id="story-title">
          Rotterdam is many worlds at once. <em>CSA brings them to one table.</em>
        </h2>
      </div>

      <div className={styles.storyGrid}>
        <div className={styles.storyCollage}>
          <figure className={styles.storyMainImage}>
            <Image
              src={assetPath("/images/back-to-2016-2.webp")}
              fill
              sizes="(max-width: 800px) 92vw, 58vw"
              alt="People together at the Back to 2016 event"
              style={{ objectFit: "cover" }}
            />
          </figure>
          <figure className={styles.storyInsetImage}>
            <Image
              src={assetPath("/images/bento-workshop.webp")}
              fill
              sizes="(max-width: 600px) 42vw, 240px"
              alt="Students making bento together at a CSA workshop"
              style={{ objectFit: "cover" }}
            />
          </figure>
          <svg className={styles.storyLine} viewBox="0 0 420 220" fill="none" aria-hidden="true">
            <path d="M7 205C71 86 173 155 218 77C248 25 333 5 415 35" />
          </svg>
          <span className={styles.storyNote}>Public CSA archive · retrieved Aug 2026</span>
        </div>

        <div className={styles.storyCopy}>
          <p className={styles.storyStatement}>
            CSA is a multicultural student association at Erasmus University Rotterdam, built to
            connect people beyond borders and backgrounds.
          </p>
          <p>
            The experience is bigger than a calendar of events. It is the first person who waves you
            over, the recipe you learn together, the language you dare to speak, and the opportunity
            someone shares at exactly the right moment.
          </p>
          <a className={styles.textLink} href="https://csa-rotterdam.nl/about/">
            Read the official CSA story <ArrowUpRight aria-hidden size={18} />
          </a>
          <dl className={styles.storyFacts}>
            <div>
              <dt>Based at</dt>
              <dd>Erasmus University Rotterdam</dd>
            </div>
            <div>
              <dt>Built around</dt>
              <dd>Culture, community, learning and opportunity</dd>
            </div>
          </dl>
        </div>
      </div>
    </section>
  );
}
