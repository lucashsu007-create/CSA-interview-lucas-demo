"use client";

import { CalendarDays, DatabaseZap, LayoutDashboard } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ComponentType } from "react";

import { cn } from "@/lib/cn";

/**
 * Three items, because there are three pages.
 *
 * Nothing is listed here that does not exist. A demo screen with a dead nav
 * item invites exactly the question you do not want in the room, and the
 * acceptance bar for this prototype already forbids broken buttons in the
 * demonstrated path. The check-in scanner lives in the member-facing runtime
 * and is reached from a device, not from this nav.
 */

interface NavItem {
  readonly href: "/" | "/events" | "/migration";
  readonly label: string;
  readonly icon: ComponentType<{ className?: string }>;
}

const ITEMS: readonly NavItem[] = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/events", label: "Events", icon: CalendarDays },
  { href: "/migration", label: "Migration", icon: DatabaseZap },
];

export function NavLinks({ orientation }: { readonly orientation: "sidebar" | "bar" }) {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Portal sections"
      className={cn(
        /* No `overflow-x-auto` on the bar: an overflow scroller CLIPS the focus
         * ring of its edge children, and the ring on the first nav item was
         * being cut to a sliver. Three items wrap sooner than they scroll. */
        orientation === "sidebar" ? "flex flex-col gap-1" : "flex flex-row flex-wrap gap-1",
      )}
    >
      {ITEMS.map(({ href, label, icon: Icon }) => {
        const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex min-h-control-md items-center gap-2 rounded-control px-3 text-bodySm font-medium whitespace-nowrap",
              "transition-colors duration-fast ease-standard",
              active
                ? "bg-brand-subtle-ground text-brand-subtle-ink"
                : "text-surface-app-ink-muted hover:bg-surface-sunken-ground hover:text-surface-app-ink",
            )}
          >
            <Icon className="size-5 shrink-0" aria-hidden />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
