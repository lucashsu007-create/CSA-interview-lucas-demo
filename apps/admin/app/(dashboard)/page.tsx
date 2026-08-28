import { CalendarClock, KeyRound, ScanLine, UserRoundCheck } from "lucide-react";
import Link from "next/link";

import { CapacityBar, CapacityLabel } from "@/components/CapacityBar";
import { Card, CardBody, CardHeader, EmptyState, buttonClassName } from "@/components/ui";
import { loadDashboard, loadViewer, type DashboardSummary } from "@/lib/data";
import { formatDateTime, formatRelative, percentOf } from "@/lib/format";
import { ROLE_LABEL, isCommitteeRole } from "@/lib/identities";
import { viewerIdFromCookies } from "@/lib/session";

export const dynamic = "force-dynamic";

/**
 * The committee dashboard. Five facts, because someone acts on five facts:
 * what is filling up, how much of the offered capacity is taken, whether
 * sign-ups moved today, who is paying member versus public price, and who has
 * come through the door. Everything else would be furniture.
 *
 * Every number on this page is a count the database produced. Nothing is
 * derived here, nothing is defaulted to zero to fill a space, and where the
 * data layer returns nothing the screen says so in a sentence. That rule is
 * load-bearing rather than decorative: this runs on seeded data in front of
 * people who will reasonably ask what is real, and one invented number loses
 * that room.
 */
export default async function DashboardPage() {
  const viewerId = await viewerIdFromCookies();
  if (viewerId === null) return <SignedOut />;

  const viewer = await loadViewer(viewerId);
  if (viewer === null) return <SignedOut />;

  /*
   * Not a permission check bolted on top — it is the honest reading of what the
   * data layer would return. `dashboardSummary` runs under the caller's own
   * session, and `registrations_read_staff` means an attendee's counts cover
   * their own rows only. Those numbers are true and would be a lie under these
   * headings.
   */
  if (!isCommitteeRole(viewer.role)) {
    return (
      <Locked
        title="This is a committee surface"
        body={`You are signed in as ${viewer.fullName} (${ROLE_LABEL[viewer.role]}). Row-level security scopes registrations to your own rows for this identity, so these committee-wide counts would be measuring one person. Switch to the staff or admin identity in the header to see them.`}
      />
    );
  }

  const summary = await loadDashboard(viewer.id);
  const now = new Date();

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-heading text-surface-app-ink">Dashboard</h1>
        <p className="mt-1 text-bodySm text-surface-app-ink-muted">
          Read as {viewer.fullName} · {ROLE_LABEL[viewer.role]}. Every figure below is a count from
          the seeded database.
        </p>
      </header>

      <UpcomingCapacity summary={summary} now={now} />

      <div className="grid items-start gap-6 md:grid-cols-2">
        <RegistrationsToday summary={summary} />
        <MembershipSplit summary={summary} />
      </div>

      <RecentCheckIns summary={summary} now={now} />
    </div>
  );
}

/* -------------------------------------------------------------------------- */

/**
 * The lead panel, and the one screen element this page is really for: which
 * event is going to run out of places first.
 */
function UpcomingCapacity({
  summary,
  now,
}: {
  readonly summary: DashboardSummary;
  readonly now: Date;
}) {
  const { capacityUsed, upcomingEvents } = summary;
  const percent = percentOf(capacityUsed.registered, capacityUsed.capacity);

  return (
    <Card className="overflow-hidden">
      <CardHeader
        title="Upcoming events"
        subtitle={
          percent === null
            ? "No capacity offered across upcoming events."
            : `${capacityUsed.registered} of ${capacityUsed.capacity} places taken across ${upcomingEvents.length} upcoming events — ${percent}% of offered capacity.`
        }
        action={
          <Link href="/events" className={buttonClassName({ variant: "primary", size: "sm" })}>
            Open events
          </Link>
        }
      />

      {upcomingEvents.length === 0 ? (
        <EmptyState
          icon={CalendarClock}
          title="Nothing upcoming"
          body="The seed holds no published event with a start time in the future. Past events still appear in the events list."
        />
      ) : (
        <ul>
          {upcomingEvents.map((event) => (
            <li
              key={event.id}
              className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-surface-card-hairline px-5 py-3 last:border-b-0"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-bodySm font-medium text-surface-card-ink">
                  {event.title}
                </p>
                <p className="text-caption text-surface-card-ink-muted">
                  {formatDateTime(event.startsAt)} · {formatRelative(event.startsAt, now)}
                </p>
              </div>
              <div className="w-full sm:w-3xs">
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
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function RegistrationsToday({ summary }: { readonly summary: DashboardSummary }) {
  const count = summary.registrationsToday;

  return (
    <Card>
      <CardHeader title="Registrations today" subtitle="Since midnight, database time." />
      <CardBody>
        {count === 0 ? (
          /* An honest nothing. Not a grey "0" that reads as a broken query. */
          <p className="text-bodySm text-surface-card-ink-muted">
            No registrations have been created since midnight. The pricing split covers every
            registration in the seed, not only today&rsquo;s.
          </p>
        ) : (
          <p>
            <span className="numeric block text-display text-surface-card-ink">{count}</span>
            <span className="text-bodySm text-surface-card-ink-muted">
              new {count === 1 ? "registration" : "registrations"} today
            </span>
          </p>
        )}
      </CardBody>
    </Card>
  );
}

/**
 * Contract §2 as a picture: the split is by the price actually charged, which
 * came from an active membership period at registration time. It is NOT a
 * breakdown of `users.role`, and it would be a different number if it were.
 */
function MembershipSplit({ summary }: { readonly summary: DashboardSummary }) {
  const { memberPrice, publicPrice, total } = summary.membershipSplit;
  const percent = percentOf(memberPrice, total);

  return (
    <Card>
      <CardHeader
        title="Member vs public pricing"
        subtitle="By the price each registration was actually charged."
      />
      <CardBody>
        {total === 0 || percent === null ? (
          <p className="text-bodySm text-surface-card-ink-muted">
            No registrations are visible to this identity, so there is no split to show.
          </p>
        ) : (
          <>
            <span
              aria-hidden
              className="block h-2 w-full overflow-hidden rounded-pill border border-surface-sunken-hairline bg-surface-sunken-ground"
            >
              <span
                className="block h-full rounded-pill bg-brand-solid-ground"
                style={{ width: `${percent}%` }}
              />
            </span>
            <dl className="mt-4 space-y-2">
              <SplitRow label="Member price" value={memberPrice} swatch="brand" />
              <SplitRow label="Public price" value={publicPrice} swatch="track" />
            </dl>
            <p className="mt-3 text-caption text-surface-card-ink-muted">
              {percent}% of {total} registrations were charged the member price.
            </p>
          </>
        )}
      </CardBody>
    </Card>
  );
}

function SplitRow({
  label,
  value,
  swatch,
}: {
  readonly label: string;
  readonly value: number;
  readonly swatch: "brand" | "track";
}) {
  return (
    <div className="flex items-center gap-2">
      <span
        aria-hidden
        className={
          swatch === "brand"
            ? "size-3 shrink-0 rounded-control bg-brand-solid-ground"
            : "size-3 shrink-0 rounded-control border border-surface-sunken-hairline bg-surface-sunken-ground"
        }
      />
      <dt className="flex-1 text-bodySm text-surface-card-ink-muted">{label}</dt>
      <dd className="numeric text-bodySm font-medium text-surface-card-ink">{value}</dd>
    </div>
  );
}

function RecentCheckIns({
  summary,
  now,
}: {
  readonly summary: DashboardSummary;
  readonly now: Date;
}) {
  const rows = summary.recentCheckIns;

  return (
    <Card className="overflow-hidden">
      <CardHeader
        title="Recent check-ins"
        subtitle="The canonical check-in time, which is the earliest reported scan — not the first one the server saw."
      />
      {rows.length === 0 ? (
        <EmptyState
          icon={ScanLine}
          title="No check-ins recorded"
          body="Nothing has been scanned through the door yet. Every scan is recorded, including duplicates and rejections, so this fills as soon as one arrives."
        />
      ) : (
        <ul>
          {rows.map((row) => (
            <li
              key={row.registrationId}
              className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-surface-card-hairline px-5 py-3 last:border-b-0"
            >
              <UserRoundCheck
                className="size-4 shrink-0 self-center text-surface-card-ink-muted"
                aria-hidden
              />
              <span className="text-bodySm font-medium text-surface-card-ink">
                {row.userFullName}
              </span>
              <span className="min-w-0 flex-1 truncate text-caption text-surface-card-ink-muted">
                {row.eventTitle}
              </span>
              <span className="numeric text-caption text-surface-card-ink-muted">
                {formatDateTime(row.checkedInAt)} · {formatRelative(row.checkedInAt, now)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

/* -------------------------------------------------------------------------- */

/**
 * Locked, not broken, and not empty. There is a real feature behind this and
 * the reader simply does not hold it yet — rendering it as a stack of zeroes
 * would be the dishonest version of the same screen.
 */
function Locked({ title, body }: { readonly title: string; readonly body: string }) {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-heading text-surface-app-ink">Dashboard</h1>
      </header>
      <Card className="max-w-2xl">
        <EmptyState icon={KeyRound} title={title} body={body} />
      </Card>
    </div>
  );
}

function SignedOut() {
  return (
    <Locked
      title="Pick a demo identity to start"
      body="Authentication here is seeded sessions: the demo addresses end in .local, which is undeliverable, so there is no magic link to send and no password to type. Choose one of the four seeded identities from the control in the header."
    />
  );
}
