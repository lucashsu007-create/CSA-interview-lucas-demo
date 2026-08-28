"use client";

import { Check, ChevronDown, LogOut, UserRound } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";

import { Badge } from "@/components/ui";
import { cn } from "@/lib/cn";
import { ROLE_LABEL } from "@/lib/identities";
import type { IdentityOption, Viewer } from "@/lib/viewer";

/**
 * Session indicator and demo-identity picker in one control.
 *
 * There is no password anywhere in this prototype and there is not meant to be:
 * contract §7 makes auth seeded sessions, because `.local` addresses are
 * undeliverable so a magic link cannot arrive. Picking a name here posts to
 * `/api/session`, which mints the HS256 token carrying `sub = users.id` and
 * sets it as an httpOnly cookie. Every subsequent database call runs inside
 * that identity's `set local request.jwt.claims`.
 *
 * The control shows who you are BEFORE it offers to change it — the whole
 * reason it exists is that a portal which cannot answer "who am I signed in as"
 * is unusable for a volunteer who shares a laptop with the rest of the board.
 */

export function IdentitySwitcher({
  viewer,
  options,
}: {
  readonly viewer: Viewer | null;
  readonly options: readonly IdentityOption[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [failed, setFailed] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    const onClick = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClick);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onClick);
    };
  }, [open]);

  const run = (request: Promise<Response>) => {
    setFailed(false);
    startTransition(async () => {
      const response = await request.catch(() => null);
      if (!response?.ok) {
        setFailed(true);
        return;
      }
      setOpen(false);
      router.refresh();
    });
  };

  const signIn = (email: string) =>
    run(
      fetch("/api/session", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email }),
      }),
    );

  const signOut = () => run(fetch("/api/session", { method: "DELETE" }));

  return (
    <div ref={rootRef} className="relative min-w-0">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-disabled={pending}
        onClick={() => setOpen((value) => !value)}
        className={cn(
          "flex min-h-control-md w-full min-w-0 items-center gap-2 rounded-control border px-2 pr-3",
          "border-surface-card-outline bg-surface-card-ground text-surface-card-ink",
          "transition-colors duration-fast ease-standard hover:bg-surface-sunken-ground",
          pending && "pointer-events-none opacity-disabled",
        )}
      >
        <span
          aria-hidden
          className="grid size-6 shrink-0 place-items-center rounded-pill bg-brand-subtle-ground text-brand-subtle-ink"
        >
          <UserRound className="size-4" />
        </span>
        <span className="min-w-0 text-left">
          <span className="block truncate text-bodySm font-medium">
            {viewer ? viewer.fullName : "Not signed in"}
          </span>
          {/* The email is the first thing to go on a phone: the name answers
              "who am I signed in as", the address only confirms it. */}
          <span className="block truncate text-caption text-surface-card-ink-muted">
            {viewer === null ? (
              "Pick a demo identity"
            ) : (
              <>
                <span className="sm:hidden">{ROLE_LABEL[viewer.role]}</span>
                <span className="hidden sm:inline">
                  {ROLE_LABEL[viewer.role]} · {viewer.email}
                </span>
              </>
            )}
          </span>
        </span>
        <ChevronDown className="size-4 shrink-0 text-surface-card-ink-muted" aria-hidden />
      </button>

      {open ? (
        <div
          role="menu"
          aria-label="Demo identities"
          className={cn(
            "absolute right-0 z-10 mt-2 w-3xs overflow-hidden",
            "rounded-card border border-surface-overlay-hairline bg-surface-overlay-ground shadow-overlay",
          )}
        >
          <p className="border-b border-surface-overlay-hairline px-3 py-2 text-caption text-surface-overlay-ink-muted">
            Seeded identities. Fictional data — no password, by design.
          </p>

          {options.length === 0 ? (
            <p className="px-3 py-3 text-bodySm text-surface-overlay-ink-muted">
              The seeded identities could not be read from the database.
            </p>
          ) : null}

          {options.map((option) => {
            const current = option.id === viewer?.id;
            return (
              <button
                key={option.id}
                type="button"
                role="menuitem"
                onClick={() => signIn(option.email)}
                className={cn(
                  "flex w-full items-center gap-2 px-3 py-2 text-left",
                  "transition-colors duration-fast ease-standard hover:bg-surface-sunken-ground",
                )}
              >
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="truncate text-bodySm font-medium text-surface-overlay-ink">
                      {option.fullName}
                    </span>
                    <Badge tone={option.role === "attendee" ? "neutral" : "brand"}>
                      {ROLE_LABEL[option.role]}
                    </Badge>
                  </span>
                  <span className="block text-caption text-surface-overlay-ink-muted">
                    {option.purpose}
                  </span>
                </span>
                {current ? (
                  <Check className="size-4 shrink-0 text-surface-overlay-ink" aria-hidden />
                ) : null}
              </button>
            );
          })}

          {viewer ? (
            <button
              type="button"
              role="menuitem"
              onClick={signOut}
              className="flex w-full items-center gap-2 border-t border-surface-overlay-hairline px-3 py-2 text-left text-bodySm text-surface-overlay-ink transition-colors duration-fast ease-standard hover:bg-surface-sunken-ground"
            >
              <LogOut className="size-4 shrink-0" aria-hidden />
              Sign out
            </button>
          ) : null}

          {failed ? (
            <p
              role="alert"
              className="border-t border-surface-overlay-hairline bg-status-danger-subtle-ground px-3 py-2 text-caption text-status-danger-subtle-ink"
            >
              Could not switch identity. The session route did not respond.
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
