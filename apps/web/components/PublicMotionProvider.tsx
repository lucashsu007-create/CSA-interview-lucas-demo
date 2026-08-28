"use client";

import { lightTheme } from "@csa/design-tokens";
import { MotionProvider, type MotionIdentity, type MotionProviderEffects } from "@csa/motion/web";
import { usePathname } from "next/navigation";
import { useCallback, type ReactNode } from "react";

const effects = ["declarative-scene"] as const satisfies MotionProviderEffects;

const identity = {
  label: "CSA Rotterdam",
  accent: lightTheme.brand.mark,
  curtain: lightTheme.brand.solid.ground,
  curtainInk: lightTheme.brand.solid.ink,
  curtainInkMuted: lightTheme.brand.solid.inkMuted,
} satisfies MotionIdentity;

/**
 * One public-web motion boundary. The server-rendered page remains complete
 * without it; this client island only installs effects approved by the scoped
 * public-web experience record.
 */
export function PublicMotionProvider({ children }: { readonly children: ReactNode }) {
  const pathname = usePathname();
  const navigate = useCallback((href: string) => {
    window.location.assign(href);
  }, []);

  return (
    <MotionProvider
      effects={effects}
      identity={identity}
      navigate={navigate}
      profile="public"
      routeKey={pathname}
    >
      {children}
    </MotionProvider>
  );
}
