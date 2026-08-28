"use client";

import { useEffect } from "react";

import { Button, ErrorState } from "@/components/ui";

/**
 * Error is a different state from empty, and this boundary is what keeps them
 * different: a failed read renders here, saying we do not know, rather than
 * falling through to a list that renders as "there are none".
 *
 * `reset` is Next's own retry — the one action. The message is deliberately not
 * the exception text: a driver error can carry a query fragment, and this is a
 * screen a stranger may be looking at.
 */
export default function EventsError({
  error,
  reset,
}: {
  readonly error: Error & { digest?: string };
  readonly reset: () => void;
}) {
  useEffect(() => {
    console.error("[csa/admin] page failed to render", error);
  }, [error]);

  return (
    <ErrorState
      title="Could not load this page"
      detail="The portal reached the database and did not get an answer it could use. Nothing was written. Retrying is safe."
      action={
        <Button variant="secondary" size="sm" onClick={reset}>
          Try again
        </Button>
      }
    />
  );
}
