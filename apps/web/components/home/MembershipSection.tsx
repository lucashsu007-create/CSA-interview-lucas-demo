import { ArrowRight, ArrowUpRight, Heart, Languages, Sparkles } from "lucide-react";
import Link from "next/link";

import styles from "./Home.module.css";

const invitations = [
  { Icon: Heart, label: "Meet people through social and cultural events" },
  { Icon: Languages, label: "Learn language by using it with others" },
  { Icon: Sparkles, label: "Discover how student teams help shape CSA" },
] as const;

export function MembershipSection() {
  return (
    <section className={styles.membership} id="membership" aria-labelledby="membership-title">
      <div className={styles.membershipMark} aria-hidden>
        CSA
      </div>
      <div className={styles.membershipInner} data-section-reveal>
        <div className={styles.membershipCopy}>
          <p className={`${styles.sectionLabel} ${styles.sectionLabelLight}`}>
            <span>05</span> Your next move
          </p>
          <h2 id="membership-title">Start with what feels like you.</h2>
          <p>
            Explore an event, read the membership information, or learn about the active team.
            Choose the path that fits what you want to do next.
          </p>
        </div>

        <ul className={styles.invitationList}>
          {invitations.map(({ Icon, label }) => (
            <li key={label}>
              <Icon aria-hidden size={20} />
              <span>{label}</span>
            </li>
          ))}
        </ul>

        <div className={styles.membershipActions}>
          <Link className={styles.paperButton} href="/membership">
            Explore membership <ArrowRight aria-hidden size={19} />
          </Link>
          <a className={styles.lightTextLink} href="https://csa-rotterdam.nl/actives-recruitment/">
            Active-team information <ArrowUpRight aria-hidden size={18} />
          </a>
        </div>
      </div>
    </section>
  );
}
