import { cn } from "@/lib/cn";

/**
 * A token-built wordmark, not CSA's actual logo file.
 *
 * The mark colour is the one measured off CSA's own logo bitmap (53.2% of its
 * opaque pixels), and white-on-that-red is the logo's own pairing, so the
 * ground and its ink travel together here exactly as they do in the token.
 * Nothing here is a hex — `brand.solid` carries both halves.
 */
export function Brandmark({ className }: { readonly className?: string }) {
  return (
    <span className={cn("flex min-w-0 items-center gap-3", className)}>
      <span
        aria-hidden
        className="grid size-8 shrink-0 place-items-center rounded-control bg-brand-solid-ground text-caption font-bold text-brand-solid-ink"
      >
        CSA
      </span>
      {/* Below `sm` the mark carries the identity on its own and the words are
          what push the session control off the screen. The rail only ever
          renders at `lg`, so it always keeps them. */}
      <span className="hidden min-w-0 sm:block">
        <span className="block truncate text-bodySm font-semibold text-surface-app-ink">
          Committee Portal
        </span>
        <span className="block truncate text-caption text-surface-app-ink-muted">
          CSA Rotterdam
        </span>
      </span>
    </span>
  );
}
