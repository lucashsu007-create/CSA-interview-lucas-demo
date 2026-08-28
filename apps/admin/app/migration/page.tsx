import { DatabaseZap, FileWarning, ShieldCheck } from "lucide-react";

import { Badge, Card, CardBody, CardHeader, EmptyState } from "@/components/ui";
import {
  loadImportRuns,
  loadMigrationOverview,
  loadQuarantine,
  loadViewer,
  type ImportRunSummary,
  type MigrationOverview,
} from "@/lib/data";
import { formatDateTime, formatPrice } from "@/lib/format";
import { ROLE_LABEL } from "@/lib/identities";
import {
  LEGACY_SYSTEM_LABEL,
  MEMBER_DATA_GATE,
  QUARANTINE_REASON_LABEL,
} from "@/lib/migration-labels";
import { viewerIdFromCookies } from "@/lib/session";

import { QuarantineQueue, type QuarantineView } from "./QuarantineQueue";

export const dynamic = "force-dynamic";

/**
 * The migration console.
 *
 * It answers one question — can this import be defended? — and it is arranged
 * in the order a reviewer would ask it: what ran, what landed, what the rules
 * refused to decide, and what still has to be true before any of it touches
 * real data.
 *
 * There is deliberately no progress bar and no percentage. A migration is not
 * measured by how much of it finished; it is measured by whether the counts can
 * be accounted for, and a bar at 97% says nothing about the 3%.
 */
export default async function MigrationPage() {
  const viewerId = await viewerIdFromCookies();
  if (viewerId === null)
    return <Locked body="Sign in as the admin identity to open the console." />;

  const viewer = await loadViewer(viewerId);
  if (viewer === null) return <Locked body="Sign in as the admin identity to open the console." />;

  /*
   * Not defence in depth for its own sake. RLS confines every table below to
   * `admin`, so a non-admin would already see an empty console — and an empty
   * console is indistinguishable from "no import has run", which is the one
   * thing this page must never say by accident.
   */
  if (viewer.role !== "admin") {
    return (
      <Locked
        body={`You are signed in as ${viewer.fullName} (${ROLE_LABEL[viewer.role]}). The import tables are confined to the admin role by row-level security, so this console would show you an empty page rather than a true one. Switch identity in the header.`}
      />
    );
  }

  const [overview, runs, quarantine] = await Promise.all([
    loadMigrationOverview(viewer.id),
    loadImportRuns(viewer.id, 8),
    loadQuarantine(viewer.id, { state: "open", limit: 40 }),
  ]);

  const records: QuarantineView[] = quarantine.map((record) => ({
    id: record.id,
    sourceSystem: record.sourceSystem,
    sourceId: record.sourceId,
    entityType: record.entityType,
    reason: record.reason,
    year: record.occurredYear === null ? "year unknown" : String(record.occurredYear),
    amount: record.amountCents === null ? null : formatPrice(record.amountCents),
    label: quarantineLabel(record.payload),
    payload: JSON.stringify(record.payload, null, 2),
  }));

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-heading text-surface-app-ink">Migration</h1>
        <p className="mt-1 text-bodySm text-surface-app-ink-muted">
          Imports from a <strong className="font-medium">synthetic</strong> WordPress, MongoDB,
          Google Forms, Mollie and office-register estate. No CSA system is read by any of this, and
          nothing here is a migration of CSA data.
        </p>
      </header>

      {overview.latestRun === null ? (
        <EmptyState
          icon={DatabaseZap}
          title="No import has run"
          body="Generate the synthetic estate and load it into a staging database: pnpm fixtures:generate, then pnpm migrate --mode load --db <staging>."
        />
      ) : (
        <>
          <LatestRun run={overview.latestRun} overview={overview} />

          <div className="grid items-start gap-6 lg:grid-cols-2">
            <ImportedRows overview={overview} />
            <ByReason overview={overview} />
          </div>

          <Card>
            <CardHeader
              title="Quarantine"
              subtitle="Rows the approved rules refused to decide. Nothing here was guessed and nothing was dropped."
            />
            <CardBody>
              {records.length === 0 ? (
                <EmptyState
                  icon={FileWarning}
                  title="Nothing open"
                  body="Every quarantined row from this import has been resolved or discarded, each with a note and an identity against it."
                />
              ) : (
                <QuarantineQueue records={records} />
              )}
            </CardBody>
          </Card>

          <PreviousRuns runs={runs} />
          <Gate />
        </>
      )}
    </div>
  );
}

/**
 * A short handle for a quarantined row, taken from whatever the legacy record
 * happened to carry.
 *
 * Deliberately a lookup over known keys rather than "the first string in the
 * payload": a payload is arbitrary legacy JSON, and picking an arbitrary field
 * out of it would eventually surface something nobody meant to display.
 */
function quarantineLabel(payload: Record<string, unknown>): string | null {
  for (const key of ["title", "name", "ledgerName", "userEmail", "description", "whichEvent"]) {
    const value = payload[key];
    if (typeof value === "string" && value.trim() !== "") {
      return value.length > 90 ? `${value.slice(0, 89)}…` : value;
    }
  }
  return null;
}

function LatestRun({
  run,
  overview,
}: {
  readonly run: ImportRunSummary;
  readonly overview: MigrationOverview;
}) {
  return (
    <Card>
      <CardHeader
        title={
          run.sourceSystem === null
            ? "Latest import — the whole estate"
            : `Latest import — ${LEGACY_SYSTEM_LABEL[run.sourceSystem]}`
        }
        subtitle={`${run.mode === "dry_run" ? "Dry run: transformed and reported, wrote no target rows" : run.mode === "delta" ? "Delta: only rows unseen by a prior run" : "Load into staging"} · started ${formatDateTime(run.startedAt)}`}
        action={
          <Badge
            tone={
              run.status === "succeeded" ? "success" : run.status === "running" ? "info" : "danger"
            }
          >
            {run.status.replace("_", " ")}
          </Badge>
        }
      />
      <CardBody className="space-y-4">
        <dl className="grid grid-cols-2 gap-4 sm:grid-cols-5">
          <Figure label="Accepted" value={run.acceptedCount} />
          <Figure label="Warning" value={run.warningCount} />
          <Figure label="Rejected" value={run.rejectedCount} />
          <Figure label="Quarantined" value={run.quarantinedCount} />
          <Figure label="Merged" value={run.mergedCount} />
        </dl>

        <div className="border-t border-surface-card-hairline pt-3">
          {/* `break-all` on the MONO SPANS only. A 64-character hash has no break
              opportunity in it and pushed the page wider than a 390px viewport;
              putting the same class on the paragraph fixed that and started
              breaking the prose mid-word instead. The hash is shown in full
              rather than truncated, because comparing it against the manifest is
              the only thing anyone does with it. */}
          <dl className="space-y-1 text-caption text-surface-card-ink-muted">
            <div className="flex flex-wrap gap-x-2">
              <dt>Extract</dt>
              <dd className="font-mono break-all">{run.extractId}</dd>
            </div>
            <div className="flex flex-wrap gap-x-2">
              <dt>sha256</dt>
              <dd className="font-mono break-all">{run.extractSha256}</dd>
            </div>
          </dl>
          <p className="mt-2 text-caption text-surface-card-ink-muted">
            Verified before a single row was transformed. An extract whose bytes moved since it was
            counted cannot support the count it was measured with.
          </p>
          <p className="mt-2 text-caption text-surface-card-ink-muted">
            {overview.openQuarantine} open and {overview.resolvedQuarantine} closed across all runs.
          </p>
        </div>
      </CardBody>
    </Card>
  );
}

function Figure({ label, value }: { readonly label: string; readonly value: number }) {
  return (
    <div>
      <dt className="text-caption font-medium text-surface-card-ink-muted uppercase">{label}</dt>
      <dd className="mt-1 text-title tabular-nums text-surface-card-ink">{value}</dd>
    </div>
  );
}

function ImportedRows({ overview }: { readonly overview: MigrationOverview }) {
  return (
    <Card>
      <CardHeader
        title="Rows carrying provenance"
        subtitle="Counted by source_system, so an imported row is never confused with a seeded one."
      />
      <CardBody>
        <dl className="divide-y divide-surface-card-hairline">
          {overview.importedRows.map((row) => (
            <div key={row.entity} className="flex items-baseline justify-between gap-4 py-2">
              <dt className="text-bodySm text-surface-card-ink">{row.entity.replace(/_/g, " ")}</dt>
              <dd className="text-bodySm tabular-nums text-surface-card-ink">{row.count}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-3 text-caption text-surface-card-ink-muted">
          Every one records the system and id it came from, which is what makes a delta import and a
          later &ldquo;where did this come from&rdquo; possible at all.
        </p>
      </CardBody>
    </Card>
  );
}

function ByReason({ overview }: { readonly overview: MigrationOverview }) {
  return (
    <Card>
      <CardHeader
        title="Open quarantine by reason"
        subtitle="The §17 rejection breakdown. The reason is a closed enum, never free text — free text cannot be counted."
      />
      <CardBody>
        {overview.byReason.length === 0 ? (
          <p className="text-bodySm text-surface-card-ink-muted">Nothing open.</p>
        ) : (
          <dl className="divide-y divide-surface-card-hairline">
            {overview.byReason.map((row) => (
              <div key={row.reason} className="flex items-baseline justify-between gap-4 py-2">
                <dt className="text-bodySm text-surface-card-ink">
                  {QUARANTINE_REASON_LABEL[row.reason]}
                </dt>
                <dd className="text-bodySm tabular-nums text-surface-card-ink">{row.count}</dd>
              </div>
            ))}
          </dl>
        )}
      </CardBody>
    </Card>
  );
}

function PreviousRuns({ runs }: { readonly runs: readonly ImportRunSummary[] }) {
  if (runs.length < 2) return null;

  return (
    <Card>
      <CardHeader
        title="Import history"
        subtitle="A re-run that wrote nothing is the point, not a failure — the provenance key refuses the duplicate."
      />
      <CardBody className="overflow-x-auto">
        <table className="w-full min-w-[42rem] text-bodySm">
          <thead>
            <tr className="text-caption text-surface-card-ink-muted uppercase">
              <th scope="col" className="py-2 text-left font-medium">
                Started
              </th>
              <th scope="col" className="py-2 text-left font-medium">
                Source
              </th>
              <th scope="col" className="py-2 text-left font-medium">
                Mode
              </th>
              <th scope="col" className="py-2 text-right font-medium">
                Accepted
              </th>
              <th scope="col" className="py-2 text-right font-medium">
                Warning
              </th>
              <th scope="col" className="py-2 text-right font-medium">
                Rejected
              </th>
              <th scope="col" className="py-2 text-left font-medium">
                Status
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-surface-card-hairline">
            {runs.map((run) => (
              <tr key={run.id}>
                <td className="py-2 whitespace-nowrap text-surface-card-ink">
                  {formatDateTime(run.startedAt)}
                </td>
                <td className="py-2 text-surface-card-ink-muted">
                  {run.sourceSystem === null
                    ? "whole estate"
                    : LEGACY_SYSTEM_LABEL[run.sourceSystem]}
                </td>
                <td className="py-2 text-surface-card-ink-muted">{run.mode.replace("_", " ")}</td>
                <td className="py-2 text-right tabular-nums text-surface-card-ink">
                  {run.acceptedCount}
                </td>
                <td className="py-2 text-right tabular-nums text-surface-card-ink">
                  {run.warningCount}
                </td>
                <td className="py-2 text-right tabular-nums text-surface-card-ink">
                  {run.rejectedCount}
                </td>
                <td className="py-2">
                  <Badge tone={run.status === "succeeded" ? "success" : "danger"} icon={false}>
                    {run.status.replace("_", " ")}
                  </Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardBody>
    </Card>
  );
}

function Gate() {
  return (
    <Card>
      <CardHeader
        title="Before member data moves"
        subtitle="The migration plan's §17 gate. Nothing here is measured by this console, and none of it is ticked automatically."
      />
      <CardBody>
        <ul className="space-y-2">
          {MEMBER_DATA_GATE.map((item) => (
            <li key={item} className="flex gap-2 text-bodySm text-surface-card-ink">
              <ShieldCheck
                className="mt-0.5 size-4 shrink-0 text-surface-card-ink-muted"
                aria-hidden
              />
              <span>{item}</span>
            </li>
          ))}
        </ul>
        <p className="mt-4 text-caption text-surface-card-ink-muted">
          A checklist that ticks itself off is a decorative gate. These are judgements a person
          makes and signs, and the console&rsquo;s job is to put the numbers in front of them — not
          to decide on their behalf.
        </p>
      </CardBody>
    </Card>
  );
}

function Locked({ body }: { readonly body: string }) {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-heading text-surface-app-ink">Migration</h1>
      </header>
      <EmptyState icon={ShieldCheck} title="Admin only" body={body} />
    </div>
  );
}
