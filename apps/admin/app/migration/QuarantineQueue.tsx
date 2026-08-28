"use client";

import type { QuarantineReason, Uuid } from "@csa/domain";
import { useState } from "react";

import { Badge, Button, Card, CardBody } from "@/components/ui";
import {
  LEGACY_SYSTEM_LABEL,
  QUARANTINE_REASON_LABEL,
  QUARANTINE_REASON_PROMPT,
} from "@/lib/migration-labels";

/**
 * The queue of rows the rules refused to guess about.
 *
 * A serialisable view of the record rather than the domain object: this is a
 * client component and `Date` does not survive the boundary intact. The parent
 * formats before handing it over, so nothing here re-derives a fact.
 */
export interface QuarantineView {
  readonly id: Uuid;
  readonly sourceSystem: keyof typeof LEGACY_SYSTEM_LABEL;
  readonly sourceId: string;
  readonly entityType: string;
  readonly reason: QuarantineReason;
  readonly year: string;
  readonly amount: string | null;
  /** A short human handle taken from the payload, when it holds one. */
  readonly label: string | null;
  readonly payload: string;
}

type Status =
  { readonly kind: "idle" | "saving" } | { readonly kind: "error"; readonly message: string };

export function QuarantineQueue({ records }: { readonly records: readonly QuarantineView[] }) {
  const [resolved, setResolved] = useState<ReadonlySet<string>>(new Set());
  const [open, setOpen] = useState<string | null>(null);

  const remaining = records.filter((record) => !resolved.has(record.id));

  return (
    <div className="space-y-3">
      <p className="text-caption text-surface-app-ink-muted">
        {remaining.length} open of {records.length} shown. Resolving one records your identity and
        your note against it, and writes an audit row in the same transaction.
      </p>

      {remaining.map((record) => (
        <QuarantineCard
          key={record.id}
          record={record}
          expanded={open === record.id}
          onToggle={() => setOpen(open === record.id ? null : record.id)}
          onResolved={() => setResolved(new Set([...resolved, record.id]))}
        />
      ))}
    </div>
  );
}

function QuarantineCard({
  record,
  expanded,
  onToggle,
  onResolved,
}: {
  readonly record: QuarantineView;
  readonly expanded: boolean;
  readonly onToggle: () => void;
  readonly onResolved: () => void;
}) {
  const [note, setNote] = useState("");
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  async function submit(state: "resolved" | "discarded") {
    setStatus({ kind: "saving" });
    try {
      const response = await fetch("/api/migration/quarantine/resolve", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: record.id, note, state }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { error?: string };
        setStatus({
          kind: "error",
          message:
            body.error === "invalid_body"
              ? "A resolution needs a note saying how it was resolved."
              : `The server refused this (${response.status}).`,
        });
        return;
      }
      onResolved();
    } catch {
      setStatus({ kind: "error", message: "The request did not reach the server." });
    }
  }

  // A note is required by the API, by the table CHECK, and here — so the button
  // that cannot succeed is disabled rather than failing after a round trip.
  const canSubmit = note.trim().length > 0 && status.kind !== "saving";

  return (
    <Card>
      <CardBody className="space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="warning">{QUARANTINE_REASON_LABEL[record.reason]}</Badge>
              <span className="text-caption text-surface-card-ink-muted">
                {LEGACY_SYSTEM_LABEL[record.sourceSystem]} · {record.entityType} · {record.year}
              </span>
              {record.amount !== null && (
                <span className="text-caption tabular-nums text-surface-card-ink-muted">
                  {record.amount}
                </span>
              )}
            </div>
            {/* A bare `101` tells a reviewer nothing about which page they are
                deciding on, and the decision is the whole point of the queue. */}
            {record.label !== null && (
              <p className="mt-2 text-bodySm font-medium text-surface-card-ink">{record.label}</p>
            )}
            <p className="mt-1 font-mono text-caption break-all text-surface-card-ink-muted">
              {record.sourceId}
            </p>
            <p className="mt-1 text-bodySm text-surface-card-ink-muted">
              {QUARANTINE_REASON_PROMPT[record.reason]}
            </p>
          </div>

          <Button variant="ghost" size="sm" onClick={onToggle} aria-expanded={expanded}>
            {expanded ? "Hide record" : "Show record"}
          </Button>
        </div>

        {expanded && (
          <pre className="overflow-x-auto rounded-control border border-surface-sunken-hairline bg-surface-sunken-ground p-3 font-mono text-caption text-surface-sunken-ink">
            {record.payload}
          </pre>
        )}

        <div className="flex flex-wrap items-end gap-2">
          <label className="min-w-0 flex-1">
            <span className="block text-caption font-medium text-surface-card-ink-muted">
              How was this resolved?
            </span>
            <input
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="e.g. confirmed with the paper register: same person as mongo-oid-014"
              className="mt-1 min-h-control-md w-full rounded-control border border-surface-card-hairline bg-surface-app-ground px-3 text-bodySm text-surface-app-ink"
            />
          </label>
          <Button size="sm" disabled={!canSubmit} onClick={() => void submit("resolved")}>
            Resolve
          </Button>
          <Button
            variant="secondary"
            size="sm"
            disabled={!canSubmit}
            onClick={() => void submit("discarded")}
          >
            Discard
          </Button>
        </div>

        {status.kind === "error" && (
          <p role="alert" className="text-caption text-status-danger-subtle-ink">
            {status.message}
          </p>
        )}
      </CardBody>
    </Card>
  );
}
