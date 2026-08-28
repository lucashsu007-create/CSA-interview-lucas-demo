"use client";

import { ArrowDown, ArrowRight, Menu, X } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { assetPath } from "@/lib/site-path";

import styles from "./SiteHeader.module.css";

const navItems = [
  { href: "/#story", label: "Our story" },
  { href: "/#participation", label: "Ways in" },
  { href: "/#moments", label: "Moments" },
  { href: "/#event", label: "Event snapshot" },
] as const;

export function SiteHeader({ current = "home" }: { readonly current?: "home" | "membership" }) {
  const [open, setOpen] = useState(false);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  const closeMenu = (returnFocus = false) => {
    setOpen(false);
    if (returnFocus) requestAnimationFrame(() => toggleRef.current?.focus());
  };

  useEffect(() => {
    if (!open) return;

    const previousOverflow = document.body.style.overflow;
    const backgroundElements = Array.from(
      document.querySelectorAll<HTMLElement>(
        ".skip-link, [data-site-header], main, [data-site-footer]",
      ),
    );
    const previousInertStates = backgroundElements.map((element) => element.inert);
    document.body.style.overflow = "hidden";
    backgroundElements.forEach((element) => {
      element.inert = true;
    });
    requestAnimationFrame(() => closeRef.current?.focus());

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeMenu(true);
        return;
      }

      if (event.key !== "Tab") return;

      const dialog = dialogRef.current;
      if (!dialog) return;

      const focusable = Array.from(
        dialog.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((element) => element.getAttribute("aria-hidden") !== "true");

      const first = focusable.at(0);
      const last = focusable.at(-1);
      if (!first || !last) return;

      const activeElement = document.activeElement;
      if (event.shiftKey && (activeElement === first || !dialog.contains(activeElement))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (activeElement === last || !dialog.contains(activeElement))) {
        event.preventDefault();
        first.focus();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      backgroundElements.forEach((element, index) => {
        element.inert = previousInertStates[index] ?? false;
      });
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <>
      <header className={styles.header} data-site-header>
        <div className={styles.inner}>
          <Link className={styles.brand} href="/#top" aria-label="CSA Rotterdam, go to homepage">
            <span className={styles.brandMark}>
              <Image src={assetPath("/images/csa-logo.png")} width={36} height={36} alt="" />
            </span>
            <span className={styles.brandCopy}>
              <strong>CSA</strong>
              <span>Rotterdam</span>
            </span>
          </Link>

          <nav className={styles.desktopNav} aria-label="Primary navigation">
            {navItems.map((item) => (
              <Link key={item.href} href={item.href}>
                {item.label}
              </Link>
            ))}
          </nav>

          <div className={styles.actions}>
            <span className={styles.location} aria-label="Location: Rotterdam, the Netherlands">
              RTM · NL
            </span>
            <Link
              className={styles.join}
              href={current === "membership" ? "#membership-options" : "/membership"}
            >
              {current === "membership" ? "Compare paths" : "Membership"}
              {current === "membership" ? (
                <ArrowDown aria-hidden size={16} />
              ) : (
                <ArrowRight aria-hidden size={16} />
              )}
            </Link>
            <button
              ref={toggleRef}
              className={styles.menuToggle}
              type="button"
              aria-label="Open menu"
              aria-expanded={open}
              aria-controls="mobile-menu"
              onClick={() => setOpen(true)}
            >
              <Menu aria-hidden />
            </button>
          </div>
        </div>
      </header>

      <noscript>
        <style>{`
          @media (max-width: 980px) {
            .${styles.header} { position: relative; }
            .${styles.inner} { flex-wrap: wrap; }
            .${styles.desktopNav} {
              display: flex;
              order: 3;
              width: 100%;
              justify-content: space-between;
              overflow-x: auto;
              border-top: 1px solid var(--hairline);
            }
            .${styles.desktopNav} a { flex: 0 0 auto; white-space: nowrap; }
            .${styles.join} { display: inline-flex; }
            .${styles.menuToggle} { display: none; }
          }
        `}</style>
      </noscript>

      <div
        ref={dialogRef}
        id="mobile-menu"
        className={`${styles.mobileMenu} ${open ? styles.mobileMenuOpen : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label="Site menu"
        aria-hidden={!open}
      >
        <div className={styles.mobileTop}>
          <span>Chinese Student Association</span>
          <button
            ref={closeRef}
            className={styles.menuClose}
            type="button"
            aria-label="Close menu"
            tabIndex={open ? 0 : -1}
            onClick={() => closeMenu(true)}
          >
            <X aria-hidden />
          </button>
        </div>

        <nav className={styles.mobileNav} aria-label="Mobile navigation">
          {navItems.map((item, index) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => closeMenu(true)}
              tabIndex={open ? 0 : -1}
            >
              <span>0{index + 1}</span>
              {item.label}
            </Link>
          ))}
        </nav>

        <div className={styles.mobileFooter}>
          <p>Connecting Beyond the Great Wall.</p>
          <Link
            href={current === "membership" ? "#membership-options" : "/membership"}
            tabIndex={open ? 0 : -1}
            onClick={() => closeMenu(true)}
          >
            {current === "membership" ? "Compare membership" : "Explore membership"}
            {current === "membership" ? (
              <ArrowDown aria-hidden size={18} />
            ) : (
              <ArrowRight aria-hidden size={18} />
            )}
          </Link>
        </div>
      </div>
    </>
  );
}
