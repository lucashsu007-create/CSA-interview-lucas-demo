import { themeCss } from "@csa/design-tokens/tailwind";
import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";

import { AppShell } from "@/components/shell/AppShell";
import { THEME_BOOT_SCRIPT } from "@/components/shell/ThemeToggle";
import { loadShellContext } from "@/lib/data";

import "./globals.css";

export const metadata: Metadata = {
  title: "CSA Committee Portal (prototype)",
  description:
    "Concept prototype for the Chinese Student Association Rotterdam IT Committee. Not an official CSA product; all data is fictional.",
  robots: { index: false, follow: false },
  /* Generated from the brand token rather than checked in as a bitmap, so the
   * tab icon cannot drift from `brand.solid`. */
  icons: { icon: "/brandmark.svg" },
};

export const viewport: Viewport = {
  /* Both themes are real, so the browser chrome should follow whichever the
   * generated stylesheet resolved rather than being pinned to one. */
  colorScheme: "light dark",
};

/** The shell reads the session cookie, so nothing here can be static. */
export const dynamic = "force-dynamic";

export default async function RootLayout({ children }: { readonly children: ReactNode }) {
  const { viewer, identities } = await loadShellContext();

  return (
    <html lang="en" suppressHydrationWarning>
      {/*
        The only place hexes reach the browser, and it is GENERATED from the
        tokens on every render rather than copied into a stylesheet by hand.
        `themeCss()` emits light as the base, dark under `prefers-color-scheme`
        for anyone who has expressed no preference, and both as explicit
        `data-theme` overrides that beat the media query in both directions.

        `href` + `precedence` are React 19's hoisting contract: without them a
        <style> here is an invalid child of <html> and produces a hydration
        error. With them React lifts it into <head> and de-duplicates it.
      */}
      <style
        href="csa-theme"
        precedence="default"
        dangerouslySetInnerHTML={{ __html: themeCss() }}
      />
      <body className="font-sans text-body antialiased">
        {/* Applies a stored theme choice before first paint, so an explicit
            override never flashes the other theme. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
        <AppShell viewer={viewer} identities={identities}>
          {children}
        </AppShell>
      </body>
    </html>
  );
}
