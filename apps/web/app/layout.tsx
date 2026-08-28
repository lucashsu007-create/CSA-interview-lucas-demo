import { brandAccent, lightTheme, radius, size, space, typeScale } from "@csa/design-tokens";
import { motionTokens } from "@csa/motion";
import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import type { CSSProperties, ReactNode } from "react";

import { PublicMotionProvider } from "@/components/PublicMotionProvider";
import { assetPath } from "@/lib/site-path";

import "@csa/motion/styles.css";
import "./globals.css";

const poppins = localFont({
  src: [
    { path: "./fonts/poppins-400.woff2", weight: "400", style: "normal" },
    { path: "./fonts/poppins-500.woff2", weight: "500", style: "normal" },
    { path: "./fonts/poppins-600.woff2", weight: "600", style: "normal" },
    { path: "./fonts/poppins-700.woff2", weight: "700", style: "normal" },
  ],
  variable: "--font-poppins",
  display: "swap",
  fallback: ["system-ui", "Segoe UI", "sans-serif"],
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_CSA_SITE_URL ?? "https://csa-rotterdam.nl"),
  title: "CSA Rotterdam — Independent Website Concept",
  description:
    "An independent website modernisation concept for Chinese Student Association Rotterdam: culture, community, learning and opportunity.",
  icons: { icon: assetPath("/images/csa-logo.png"), apple: assetPath("/images/csa-logo.png") },
  openGraph: {
    title: "CSA Rotterdam — Independent Website Concept",
    description:
      "Independent modernisation concept using public CSA Rotterdam content and imagery.",
    images: [
      {
        url: assetPath("/images/back-to-2016-2.webp"),
        width: 1600,
        height: 900,
        alt: "People together at a CSA Rotterdam community event",
      },
    ],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "CSA Rotterdam — Independent Website Concept",
    description:
      "Independent modernisation concept using public CSA Rotterdam content and imagery.",
    images: [assetPath("/images/back-to-2016-2.webp")],
  },
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  colorScheme: "light",
  themeColor: lightTheme.brand.mark,
};

const experienceVariables = {
  "--surface-app": lightTheme.surface.app.ground,
  "--surface-card": lightTheme.surface.card.ground,
  "--surface-sunken": lightTheme.surface.sunken.ground,
  "--ink": lightTheme.surface.app.ink,
  "--ink-muted": lightTheme.surface.app.inkMuted,
  "--hairline": lightTheme.surface.app.hairline,
  "--outline": lightTheme.surface.app.outline,
  "--focus": lightTheme.surface.app.focusRing,
  "--brand": lightTheme.brand.solid.ground,
  "--brand-ink": lightTheme.brand.solid.ink,
  "--brand-muted": lightTheme.brand.solid.inkMuted,
  "--brand-hairline": lightTheme.brand.solid.hairline,
  "--brand-outline": lightTheme.brand.solid.outline,
  "--brand-focus": lightTheme.brand.solid.focusRing,
  "--brand-subtle": lightTheme.brand.subtle.ground,
  "--brand-subtle-ink": lightTheme.brand.subtle.ink,
  "--brand-subtle-muted": lightTheme.brand.subtle.inkMuted,
  "--gold": brandAccent.warm,
  "--link": lightTheme.link.ink,
  "--link-hover": lightTheme.link.hover,
  "--link-pressed": lightTheme.link.pressed,
  "--space-1": `${space[1]}px`,
  "--space-2": `${space[2]}px`,
  "--space-3": `${space[3]}px`,
  "--space-4": `${space[4]}px`,
  "--space-5": `${space[5]}px`,
  "--space-6": `${space[6]}px`,
  "--space-8": `${space[8]}px`,
  "--space-10": `${space[10]}px`,
  "--space-12": `${space[12]}px`,
  "--space-16": `${space[16]}px`,
  "--space-20": `${space[20]}px`,
  "--space-24": `${space[24]}px`,
  "--radius-control": `${radius.control}px`,
  "--radius-card": `${radius.card}px`,
  "--radius-pill": `${radius.pill}px`,
  "--touch-target": `${size.touchTarget.min}px`,
  "--type-caption-size": `${typeScale.caption.size}px`,
  "--type-caption-line": `${typeScale.caption.lineHeight}px`,
  "--type-caption-tracking": `${typeScale.caption.letterSpacing}em`,
  "--type-caption-weight": `${typeScale.caption.weight}`,
  "--duration-instant": `${motionTokens.duration.instant}ms`,
  "--duration-fast": `${motionTokens.duration.fast}ms`,
  "--duration-base": `${motionTokens.duration.base}ms`,
  "--duration-slow": `${motionTokens.duration.slow}ms`,
  "--ease-enter": motionTokens.easing.enter.css,
  "--ease-exit": motionTokens.easing.exit.css,
  "--ease-standard": motionTokens.easing.standard.css,
} satisfies Record<`--${string}`, string>;

export default function RootLayout({ children }: { readonly children: ReactNode }) {
  return (
    <html lang="en" style={experienceVariables as CSSProperties} suppressHydrationWarning>
      <body className={`${poppins.variable} ${poppins.className}`}>
        <a className="skip-link" href="#main-content">
          Skip to content
        </a>
        <PublicMotionProvider>{children}</PublicMotionProvider>
      </body>
    </html>
  );
}
