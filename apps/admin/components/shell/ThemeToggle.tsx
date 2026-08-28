"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";

import { cn } from "@/lib/cn";

/**
 * Three states, not two: system is the default and has to be reachable again
 * once a reader has overridden it.
 *
 * That matches what `themeCss()` emits — light as the base, dark under
 * `prefers-color-scheme` for anyone who has expressed no preference, and both
 * available as an explicit `data-theme` override that beats the media query in
 * both directions. Clearing the attribute is what "system" means.
 */

const STORAGE_KEY = "csa-theme";

type Choice = "system" | "light" | "dark";

const ORDER: readonly Choice[] = ["system", "light", "dark"];

const META: Record<Choice, { label: string; icon: typeof Sun }> = {
  system: { label: "System theme", icon: Monitor },
  light: { label: "Light theme", icon: Sun },
  dark: { label: "Dark theme", icon: Moon },
};

function apply(choice: Choice): void {
  const root = document.documentElement;
  if (choice === "system") {
    root.removeAttribute("data-theme");
    window.localStorage.removeItem(STORAGE_KEY);
  } else {
    root.setAttribute("data-theme", choice);
    window.localStorage.setItem(STORAGE_KEY, choice);
  }
}

export function ThemeToggle() {
  const [choice, setChoice] = useState<Choice>("system");

  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === "light" || stored === "dark") setChoice(stored);
  }, []);

  const next = ORDER[(ORDER.indexOf(choice) + 1) % ORDER.length] ?? "system";
  const Icon = META[choice].icon;

  return (
    <button
      type="button"
      title={META[choice].label}
      aria-label={`${META[choice].label}. Switch to ${META[next].label.toLowerCase()}`}
      onClick={() => {
        apply(next);
        setChoice(next);
      }}
      className={cn(
        "grid size-10 shrink-0 place-items-center rounded-control",
        "border border-surface-card-outline bg-surface-card-ground text-surface-card-ink",
        "transition-colors duration-fast ease-standard hover:bg-surface-sunken-ground",
      )}
    >
      <Icon className="size-5" aria-hidden />
    </button>
  );
}

/**
 * Runs before first paint so an explicit choice does not flash the other theme.
 * Kept as a string because it has to be inline in the document head; it touches
 * only the attribute the generated stylesheet already keys off.
 */
export const THEME_BOOT_SCRIPT = `try{var t=localStorage.getItem('${STORAGE_KEY}');if(t==='light'||t==='dark'){document.documentElement.setAttribute('data-theme',t)}}catch(e){}`;
