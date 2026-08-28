import { registrationClosedReason } from "@csa/domain";
import { ArrowUpRight, CalendarDays, CalendarX, MapPin } from "lucide-react";
import Link from "next/link";

import { CapacityBar, CapacityLabel } from "@/components/CapacityBar";
import { EventStatusBadge } from "@/components/EventStatusBadge";
import { Card, EmptyState, buttonClassName } from "@/components/ui";
import { loadEvents, type EventListItem } from "@/lib/data";
import {
  EVENT_CATEGORY_LABEL,
  formatDate,
  formatDateTime,
  formatPrice,
  formatRelative,
} from "@/lib/format";
import { viewerIdFromCookies } from "@/lib/session";

export const dynamic = "force-dynamic";

/**
 * The seeded events, as the committee register sees them: dense, hairline-ruled,
 * small type, everything on one screen at a desk.
 *
 * TWO LAYOUTS, NOT ONE SHRUNK ONE. Below `md` this is a stacked list, because a
 * six-column table at 390px is either a horizontal scrollbar or a lie. At `md`
 * and up it is a real table, because that is what scanning fifteen rows for the
 * one that is nearly full actually wants. The duplication is the point — a
 * table with `hidden` columns is a desktop layout pretending to be responsive.
 *
 * Nothing here computes domain truth. Capacity, spots remaining and both prices
 * are fields the data layer resolved; the registration window comes from
 * `registrationClosedReason` in `@csa/domain`, which checks in the same order
 * the database does, so the portal cannot disagree with the server about
 * whether a door is shut.
 */
export default async function EventsPage() {
  const viewerId = await viewerIdFromCookies();
  const events = await loadEvents(viewerId);
  const now = new Date();

  /*
   * Grouped, not merely sorted. The data layer returns soonest-first, which puts
   * events that already happened at the top of a screen whose whole job is the
   * ones that have not. Past events still belong here — a committee looks up
   * what an evening actually did — they just do not lead.
   */
  const upcoming = events.filter((event) => event.startsAt.getTime() >= now.getTime());
  const past = events.filter((event) => event.startsAt.getTime() < now.getTime()).reverse();
  const featured = upcoming[0];

  return (
    <div className="space-y-8">
      <section className="csa-reveal csa-event-hero relative overflow-hidden rounded-card bg-brand-solid-ground text-brand-solid-ink">
        <div className="csa-event-hero-grid" aria-hidden />
        <div className="relative grid gap-8 px-6 py-8 sm:px-10 sm:py-10 lg:grid-cols-[1fr_auto] lg:items-end">
          <div className="max-w-2xl">
            <p className="text-caption font-semibold uppercase tracking-wide text-brand-solid-ink-muted">
              Chinese Student Association Rotterdam
            </p>
            <h1 className="mt-4 max-w-xl text-display text-brand-solid-ink">
              Make room for what&apos;s next.
            </h1>
            <p className="mt-4 max-w-lg text-body text-brand-solid-ink-muted">
              Discover the people, ideas and nights that bring Rotterdam&apos;s student community
              together.
            </p>
          </div>
          <div className="border-l border-brand-solid-outline pl-5 text-bodySm text-brand-solid-ink-muted lg:max-w-3xs">
            <span className="block text-caption font-semibold uppercase tracking-wide">
              The programme
            </span>
            <span className="mt-2 block text-title text-brand-solid-ink">
              {upcoming.length} moments ahead
            </span>
            <span className="mt-1 block">Built by students, open to the city.</span>
          </div>
        </div>
      </section>

      <header className="csa-reveal csa-reveal-delay-one flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-caption font-semibold uppercase tracking-wide text-brand-mark">
            Rotterdam / 2026
          </p>
          <h2 className="mt-2 text-heading text-surface-app-ink">Events</h2>
          <p className="mt-2 max-w-2xl text-bodySm text-surface-app-ink-muted">
            {events.length === 0
              ? "Nothing is visible to this identity."
              : `${upcoming.length} upcoming and ${past.length} past. Find your next room, conversation or reason to stay a little longer.`}
          </p>
        </div>
        <Link
          href="https://csa-rotterdam.nl/contact"
          className={buttonClassName({ variant: "secondary", size: "sm" })}
        >
          Get in touch <ArrowUpRight className="size-4" aria-hidden />
        </Link>
      </header>

      {events.length > 0 ? (
        <p className="sr-only">
          Scoped by row-level security to what this identity may see. A guest is shown published
          events only.
        </p>
      ) : null}

      {events.length === 0 ? (
        <Card>
          <EmptyState
            icon={CalendarX}
            title="No events to show"
            body="Row-level security only shows an identity the events it is allowed to see. A guest sees published events; sign in as a committee identity to see the rest."
          />
        </Card>
      ) : (
        <>
          {featured ? <FeaturedEvent event={featured} now={now} /> : null}
          <EventGroup heading="Upcoming" events={upcoming} now={now} />
          <EventGroup heading="Already happened" events={past} now={now} />
        </>
      )}
    </div>
  );
}

function FeaturedEvent({ event, now }: { readonly event: EventListItem; readonly now: Date }) {
  return (
    <section className="csa-reveal csa-reveal-delay-two grid overflow-hidden rounded-card border border-surface-card-hairline bg-surface-card-ground lg:grid-cols-[1.1fr_0.9fr]">
      <div className="csa-feature-art relative min-h-64 overflow-hidden bg-brand-solid-ground p-6 text-brand-solid-ink sm:p-8">
        <div className="csa-feature-art-lines" aria-hidden />
        <div className="relative flex h-full flex-col justify-between gap-12">
          <div className="flex items-center gap-2 text-caption font-semibold uppercase tracking-wide text-brand-solid-ink-muted">
            <CalendarDays className="size-4" aria-hidden />
            Next on the calendar
          </div>
          <p className="max-w-lg text-display text-brand-solid-ink">{event.title}</p>
        </div>
      </div>
      <div className="flex flex-col justify-between gap-8 p-6 sm:p-8">
        <div>
          <p className="text-caption font-semibold uppercase tracking-wide text-brand-mark">
            {EVENT_CATEGORY_LABEL[event.category]}
          </p>
          <p className="mt-4 text-title text-surface-card-ink">A place to show up curious.</p>
          <dl className="mt-6 space-y-3 text-bodySm">
            <div className="flex gap-3">
              <dt className="w-5 shrink-0 text-brand-mark">
                <CalendarDays className="size-5" aria-hidden />
              </dt>
              <dd className="text-surface-card-ink">{formatDateTime(event.startsAt)}</dd>
            </div>
            <div className="flex gap-3">
              <dt className="w-5 shrink-0 text-brand-mark">
                <MapPin className="size-5" aria-hidden />
              </dt>
              <dd className="text-surface-card-ink">{event.location}</dd>
            </div>
          </dl>
        </div>
        <div className="border-t border-surface-card-hairline pt-4">
          <div className="flex items-center justify-between gap-4 text-bodySm">
            <span className="text-surface-card-ink-muted">
              {registrationWindowText(event, now)}
            </span>
            <span className="numeric font-semibold text-brand-mark">
              {formatPrice(event.pricePublicCents)}
            </span>
          </div>
          <CapacityBar
            className="mt-3"
            registered={event.registeredCount}
            capacity={event.capacity}
          />
        </div>
      </div>
    </section>
  );
}

function EventGroup({
  heading,
  events,
  now,
}: {
  readonly heading: string;
  readonly events: readonly EventListItem[];
  readonly now: Date;
}) {
  if (events.length === 0) return null;

  return (
    <section className="csa-reveal csa-reveal-delay-three space-y-3">
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-caption font-semibold text-surface-app-ink-muted uppercase">
          {heading}
        </h2>
        <span className="text-caption text-surface-app-ink-muted">{events.length} listed</span>
      </div>
      <ul className="grid gap-3 md:grid-cols-2">
        {events.map((event) => (
          <li key={event.id}>
            <Card className="h-full p-5 transition-transform duration-fast ease-standard hover:-translate-y-px">
              <EventBlock event={event} now={now} />
            </Card>
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * Whether the door is open, from the shared domain predicate rather than a date
 * comparison written here.
 *
 * `registrationClosedReason` checks in the same order `register_for_event`
 * does, so the line on this row is the failure the server would raise. It
 * deliberately never says `event_full` — capacity is only safe to judge under
 * the row lock inside that transaction, and the capacity column beside this one
 * carries the count instead.
 */
function registrationWindowText(event: EventListItem, now: Date): string {
  const reason = registrationClosedReason(event, now);

  if (reason === "registration_closed") return `Closed ${formatDate(event.registrationDeadlineAt)}`;
  if (reason === "event_not_published") return "Not open for registration";
  return `Open until ${formatDate(event.registrationDeadlineAt)}`;
}

/** The table cell's second line. The block layout renders the same string inline. */
function RegistrationWindow({ event, now }: { readonly event: EventListItem; readonly now: Date }) {
  return (
    <p className="mt-1 text-caption whitespace-nowrap text-surface-card-ink-muted">
      {registrationWindowText(event, now)}
    </p>
  );
}

function EventBlock({ event, now }: { readonly event: EventListItem; readonly now: Date }) {
  return (
    <div className="flex h-full flex-col gap-5">
      <div className="min-w-0">
        <div className="flex items-start justify-between gap-3">
          <p className="text-title text-surface-card-ink">{event.title}</p>
          <EventStatusBadge status={event.status} />
        </div>
        <p className="text-caption text-surface-card-ink-muted">
          {EVENT_CATEGORY_LABEL[event.category]} · {event.location}
        </p>
        <p className="mt-1 text-caption text-surface-card-ink-muted">
          {formatDateTime(event.startsAt)} · {formatRelative(event.startsAt, now)}
        </p>
      </div>

      <div className="mt-auto space-y-3 border-t border-surface-card-hairline pt-4">
        <div className="flex items-center justify-between gap-3">
          <span className="text-caption text-surface-card-ink-muted">
            {registrationWindowText(event, now)}
          </span>
          <span className="text-caption font-medium text-brand-mark">
            {formatRelative(event.startsAt, now)}
          </span>
        </div>

        <div>
          <CapacityLabel
            registered={event.registeredCount}
            capacity={event.capacity}
            remaining={event.spotsRemaining}
          />
          <CapacityBar
            className="mt-2"
            registered={event.registeredCount}
            capacity={event.capacity}
          />
        </div>

        <dl className="flex gap-6 text-caption">
          <div className="flex gap-2">
            <dt className="text-surface-card-ink-muted">Member</dt>
            <dd className="numeric font-medium text-surface-card-ink">
              {formatPrice(event.priceMemberCents)}
            </dd>
          </div>
          <div className="flex gap-2">
            <dt className="text-surface-card-ink-muted">Public</dt>
            <dd className="numeric font-medium text-surface-card-ink">
              {formatPrice(event.pricePublicCents)}
            </dd>
          </div>
        </dl>
      </div>
    </div>
  );
}
