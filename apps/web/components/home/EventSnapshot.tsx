import { ArrowUpRight, CalendarDays, Clock3, MapPin, Ticket } from "lucide-react";
import Image from "next/image";

import { assetPath } from "@/lib/site-path";

import styles from "./Home.module.css";

const eventDetails = [
  { label: "Date", value: "24 August 2026", Icon: CalendarDays },
  { label: "Time", value: "19:00–22:00", Icon: Clock3 },
  { label: "Place", value: "De Gele Kanarie", Icon: MapPin },
  { label: "Ticket", value: "Free", Icon: Ticket },
] as const;

export function EventSnapshot() {
  return (
    <section className={styles.event} id="event" aria-labelledby="event-title">
      <div className={styles.eventShell} data-section-reveal>
        <div className={styles.eventPoster}>
          <Image
            src={assetPath("/images/cheers-with-peers.webp")}
            fill
            sizes="(max-width: 820px) 92vw, 47vw"
            alt="Cheers with Peers event artwork"
            style={{ objectFit: "contain" }}
          />
          <span className={styles.eventSnapshotLabel}>Public-site snapshot · 24.08.26</span>
        </div>

        <div className={styles.eventCopy}>
          <p className={styles.sectionLabel}>
            <span>04</span> A public event snapshot
          </p>
          <p className={styles.eventKicker}>Social · public-site archive</p>
          <h2 id="event-title">Cheers with Peers</h2>
          <p>
            A captured example of how CSA turns a simple summer evening into an easy first step into
            the community. This event date has passed; the details are preserved as a public content
            snapshot, not a live listing.
          </p>

          <dl className={styles.eventDetails}>
            {eventDetails.map(({ label, value, Icon }) => (
              <div key={label}>
                <dt>
                  <Icon aria-hidden size={17} /> {label}
                </dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>

          <div className={styles.eventActions}>
            <a
              className={styles.primaryButton}
              href="https://csa-rotterdam.nl/events/cheers-with-peers"
            >
              View source event page <ArrowUpRight aria-hidden size={18} />
            </a>
            <a className={styles.textLink} href="https://csa-rotterdam.nl/past-events/">
              Browse CSA events <ArrowUpRight aria-hidden size={18} />
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
