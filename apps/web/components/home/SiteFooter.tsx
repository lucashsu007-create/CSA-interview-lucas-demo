import Image from "next/image";
import Link from "next/link";

import { assetPath } from "@/lib/site-path";

import styles from "./Home.module.css";

const exploreLinks = [
  ["About CSA", "https://csa-rotterdam.nl/about/"],
  ["Past events", "https://csa-rotterdam.nl/past-events/"],
  ["Language courses", "https://csa-rotterdam.nl/language-courses/"],
  ["CSA partners", "https://csa-rotterdam.nl/csa-partners/"],
] as const;

const joinLinks = [
  ["Membership", "/membership"],
  ["Active member", "https://csa-rotterdam.nl/actives-recruitment/"],
  ["Job portal", "https://csa-rotterdam.nl/jobs/"],
  ["Contact", "https://csa-rotterdam.nl/contact/"],
] as const;

export function SiteFooter() {
  return (
    <footer className={styles.footer} data-site-footer>
      <div className={styles.footerGrid}>
        <div className={styles.footerBrand}>
          <Link href="/#top" aria-label="CSA Rotterdam, go to homepage">
            <span>
              <Image src={assetPath("/images/csa-logo.png")} width={42} height={42} alt="" />
            </span>
            <strong>CSA Rotterdam</strong>
          </Link>
          <p>Connecting Beyond the Great Wall.</p>
        </div>

        <nav className={styles.footerColumn} aria-label="Explore CSA">
          <h2>Explore</h2>
          {exploreLinks.map(([label, href]) => (
            <a href={href} key={label}>
              {label}
            </a>
          ))}
        </nav>

        <nav className={styles.footerColumn} aria-label="Join CSA">
          <h2>Join</h2>
          {joinLinks.map(([label, href]) =>
            href === "/membership" ? (
              <Link href="/membership" key={label}>
                {label}
              </Link>
            ) : (
              <a href={href} key={label}>
                {label}
              </a>
            ),
          )}
        </nav>

        <div className={styles.footerColumn}>
          <h2>Find us</h2>
          <address>
            Room PT-068
            <br />
            Burgemeester Oudlaan 50
            <br />
            3062 PA Rotterdam
          </address>
          <small>Public-site contact snapshot · August 2026</small>
          <a href="mailto:info@csa-rotterdam.nl">info@csa-rotterdam.nl</a>
        </div>
      </div>

      <div className={styles.footerBottom}>
        <p>Independent website modernisation concept · Public CSA content and imagery.</p>
        <div className={styles.socials} aria-label="CSA Rotterdam social media">
          <a href="https://www.instagram.com/csa_rotterdam/" aria-label="Instagram">
            IG
          </a>
          <a href="https://www.facebook.com/CSA.Rotterdam" aria-label="Facebook">
            FB
          </a>
          <a
            href="https://www.linkedin.com/company/chinese-student-association-rotterdam/"
            aria-label="LinkedIn"
          >
            in
          </a>
        </div>
      </div>
    </footer>
  );
}
