import { cn } from "@/lib/cn";

/**
 * Skeletons over spinners, because the shape is known before the data is.
 *
 * The rule this exists to enforce is that a skeleton MIRRORS the real layout —
 * a stack of generic grey bars is a spinner with extra steps, and it guarantees
 * the content jumps when it arrives. `SkeletonRow` and `SkeletonCard` below are
 * shaped like the table row and the panel they stand in for; if either layout
 * changes, its skeleton changes with it.
 *
 * The pulse animates opacity only, and `prefers-reduced-motion` flattens it via
 * the global reset in `globals.css`.
 */

export interface SkeletonProps {
  readonly className?: string;
}

export function Skeleton({ className }: SkeletonProps) {
  return (
    <span
      aria-hidden
      className={cn("block animate-pulse rounded-control bg-surface-sunken-ground", className)}
    />
  );
}

/** One row of the events table: title + meta, then three trailing columns. */
export function SkeletonRow() {
  return (
    <div className="flex items-center gap-4 border-b border-surface-card-hairline px-5 py-4 last:border-b-0">
      <div className="min-w-0 flex-1 space-y-2">
        <Skeleton className="h-4 w-1/2" />
        <Skeleton className="h-3 w-1/3" />
      </div>
      <Skeleton className="h-4 w-16" />
      <Skeleton className="hidden h-4 w-16 sm:block" />
      <Skeleton className="hidden h-4 w-16 md:block" />
    </div>
  );
}

/** A dashboard panel: header rule, then three lines of body. */
export function SkeletonCard({ rows = 3 }: { readonly rows?: number }) {
  return (
    <div className="rounded-card border border-surface-card-hairline bg-surface-card-ground">
      <div className="border-b border-surface-card-hairline px-5 py-4">
        <Skeleton className="h-5 w-1/3" />
      </div>
      <div className="space-y-3 px-5 py-4">
        {Array.from({ length: rows }, (_, index) => (
          <Skeleton key={index} className="h-4" />
        ))}
      </div>
    </div>
  );
}

/**
 * The list of skeletons a loading table renders. Kept here rather than at the
 * call site so the row count is one decision, not per-page drift.
 */
export function SkeletonTable({ rows = 5 }: { readonly rows?: number }) {
  return (
    <div aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading</span>
      {Array.from({ length: rows }, (_, index) => (
        <SkeletonRow key={index} />
      ))}
    </div>
  );
}
