/**
 * Which ground the subtree is painted on.
 *
 * The token package's central rule is that a ground is never a bare colour: it
 * is a `Surface` carrying the ink, muted ink, hairline and outline that stay
 * legible on it. The bug that rule prevents is a ground that does not flip
 * between themes sitting under ink that does — each token individually correct,
 * the pairing invisible in one theme.
 *
 * A React context is how that rule is enforced at the component level rather
 * than by review. `Screen` publishes the app surface, `Card` publishes the card
 * surface, `Badge` publishes its own status surface, and `AppText` reads ink
 * from whichever is nearest. No component picks a text colour, so no component
 * can pick the wrong one.
 */
import type { Surface } from "@csa/design-tokens";
import { createContext, useContext } from "react";
import type { ReactNode } from "react";

import { useTheme } from "@/lib/theme";

const SurfaceContext = createContext<Surface | null>(null);

export function SurfaceProvider({ surface, children }: { surface: Surface; children: ReactNode }) {
  return <SurfaceContext.Provider value={surface}>{children}</SurfaceContext.Provider>;
}

/** The nearest declared surface, defaulting to the screen ground. */
export function useSurface(): Surface {
  const theme = useTheme();
  return useContext(SurfaceContext) ?? theme.surface.app;
}
