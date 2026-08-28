import type { ReactNode } from "react";

import { Brandmark } from "@/components/shell/Brandmark";
import { IdentitySwitcher } from "@/components/shell/IdentitySwitcher";
import { NavLinks } from "@/components/shell/NavLinks";
import { ThemeToggle } from "@/components/shell/ThemeToggle";
import type { IdentityOption, Viewer } from "@/lib/viewer";

/**
 * The committee register: dense operational chrome a volunteer can learn in
 * five minutes. Not a marketing shell — no hero, no gradient, no glass.
 *
 * Two layouts rather than one shrunk one. Below `lg` the nav is a horizontal
 * row under the header, because a 390px-wide screen has no room for a rail and
 * a collapsing drawer would be a control invented to look substantial. At `lg`
 * and above it is a fixed rail, which is what a portal used all evening at a
 * desk wants.
 */

export function AppShell({
  viewer,
  identities,
  children,
}: {
  readonly viewer: Viewer | null;
  readonly identities: readonly IdentityOption[];
  readonly children: ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col lg:flex-row">
      {/* Rail — large screens only. */}
      <div className="hidden shrink-0 border-r border-surface-app-hairline lg:flex lg:w-3xs lg:flex-col lg:gap-6 lg:px-4 lg:py-5">
        <Brandmark />
        <NavLinks orientation="sidebar" />
      </div>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-10 border-b border-surface-app-hairline bg-surface-app-ground">
          <div className="flex items-center gap-3 px-4 py-3 lg:px-6">
            <Brandmark className="lg:hidden" />
            {/* At rail widths the brandmark has moved out of the header, so the
                standing concept label takes the space rather than leaving an
                empty band — it is the one thing that should be readable from
                across a room during a demo. */}
            <PrototypeNotice className="hidden lg:block" />
            <div className="ml-auto flex min-w-0 items-center gap-2">
              <ThemeToggle />
              <IdentitySwitcher viewer={viewer} options={identities} />
            </div>
          </div>
          <div className="border-t border-surface-app-hairline px-4 py-2 lg:hidden">
            <NavLinks orientation="bar" />
          </div>
        </header>

        <main className="min-w-0 flex-1 px-4 py-6 lg:px-6 lg:py-8">
          <div className="mx-auto w-full max-w-5xl">{children}</div>
        </main>

        <footer className="border-t border-surface-app-hairline px-4 py-4 lg:hidden">
          <PrototypeNotice />
        </footer>
      </div>
    </div>
  );
}

/**
 * Standing rule: concept labelling stays visible on any demo surface. It is not
 * a disclaimer bolted on at the end — someone looking at this screen in a room
 * has to be able to tell at a glance that the numbers are seeded.
 */
function PrototypeNotice({ className }: { readonly className?: string }) {
  return (
    <p className={className}>
      <span className="block text-caption font-medium text-surface-app-ink">Concept prototype</span>
      <span className="block text-caption text-surface-app-ink-muted">
        Not an official CSA product. All data shown is fictional and seeded.
      </span>
    </p>
  );
}
