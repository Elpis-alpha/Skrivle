"use client";

// STYLE_GUIDE.md §4.1 — 64px bar, wordmark left. Transparent over the paper at
// the top of the page; the hairline arrives once you've scrolled past it, so
// the hero reads as one uninterrupted sheet.

import Link from "next/link";
import { Menu, X } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Wordmark } from "@/components/ui/Wordmark";
import { ThemeToggle } from "@/components/site/ThemeToggle";
import { UserMenu } from "@/components/site/UserMenu";
import { NAV_LINKS } from "@/lib/site";
import { NewBoardButton } from "@/components/landing/NewBoardButton";

// §10.16's dialog treatment, applied to the full-screen mobile panel: scrim
// fade + 8px rise on the way in, --dur-slow. Reduced-motion → fade only, per
// the same spec.
const ENTER_EASE = [0.3, 0, 0, 1] as const; // --ease-entrance
const EXIT_EASE = [0.2, 0, 0, 1] as const; // --ease-standard

export function SiteHeader() {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const reduced = useReducedMotion();
  const panelId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // Closing always hands focus back to the control that opened the menu.
  const closeMenu = useCallback(() => {
    setMenuOpen(false);
    triggerRef.current?.focus();
  }, []);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // A menu that scrolls the page behind it is worse than no menu. Locked as
  // soon as it opens; unlocked once the closing animation actually finishes
  // (onExitComplete below), not the instant `menuOpen` flips to false —
  // otherwise the page behind could shift while the panel is still fading.
  useEffect(() => {
    if (menuOpen) document.body.style.overflow = "hidden";
  }, [menuOpen]);
  useEffect(() => () => {
    document.body.style.overflow = "";
  }, []);

  // The panel is lg:hidden, so widening past lg would hide it while leaving the
  // body scroll-locked and no visible way to unlock it.
  useEffect(() => {
    if (!menuOpen) return;
    const wide = window.matchMedia("(min-width: 64rem)");
    const onChange = () => wide.matches && setMenuOpen(false);
    onChange();
    wide.addEventListener("change", onChange);
    return () => wide.removeEventListener("change", onChange);
  }, [menuOpen]);

  // Esc closes; Tab is kept inside the panel while it's open.
  useEffect(() => {
    if (!menuOpen) return;

    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        closeMenu();
        return;
      }
      if (event.key !== "Tab") return;

      const focusable = panelRef.current?.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled])',
      );
      if (!focusable?.length) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;

      if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    }

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menuOpen, closeMenu]);

  return (
    <>
    <header
      className={
        "sticky top-0 z-50 h-16 bg-canvas/85 backdrop-blur-sm " +
        "transition-[border-color,box-shadow] duration-(--dur-base) ease-standard " +
        (scrolled ? "border-b border-border" : "border-b border-transparent")
      }
    >
      <div className="shell flex h-16 items-center gap-6">
        <Link
          href="/"
          className="rounded-sm focus-visible:focus-ring"
          aria-label="Skrivle — home"
        >
          <Wordmark className="text-md" />
        </Link>

        <nav aria-label="Main" className="ml-auto hidden items-center gap-1 lg:flex">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={
                "rounded-sm px-3 py-2 text-base font-medium text-ink-secondary " +
                "transition-colors duration-(--dur-fast) ease-standard " +
                "hover:bg-wg-50 hover:text-ink focus-visible:focus-ring"
              }
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-2 lg:ml-0">
          <ThemeToggle />

          {/* Hidden on a wrapper, not on the buttons: Button sets its own
              `display`, and a `hidden` utility alongside it loses the tie. */}
          <div className="hidden items-center gap-2 sm:flex">
            <UserMenu size="sm" />
            <NewBoardButton size="sm">New board</NewBoardButton>
          </div>

          <button
            ref={triggerRef}
            type="button"
            onClick={() => setMenuOpen(true)}
            aria-label="Open menu"
            aria-expanded={menuOpen}
            aria-controls={panelId}
            className={
              "inline-flex size-11 items-center justify-center rounded-sm text-ink " +
              "hover:bg-wg-50 focus-visible:focus-ring lg:hidden"
            }
          >
            <Menu size={20} strokeWidth={1.5} aria-hidden="true" />
          </button>
        </div>
      </div>

    </header>

      {/* Rendered outside <header> on purpose: the header's backdrop-blur makes
          it the containing block for position:fixed, which would pin this panel
          to the 64px bar instead of the viewport. */}
      <AnimatePresence onExitComplete={() => (document.body.style.overflow = "")}>
        {menuOpen ? (
          <motion.div
            ref={panelRef}
            id={panelId}
            role="dialog"
            aria-modal="true"
            aria-label="Menu"
            className="fixed inset-0 z-60 bg-canvas lg:hidden"
            initial={reduced ? false : { opacity: 0, y: -8 }}
            animate={{
              opacity: 1,
              y: 0,
              transition: { duration: reduced ? 0 : 0.28, ease: ENTER_EASE },
            }}
            exit={{
              opacity: 0,
              y: reduced ? 0 : -8,
              transition: { duration: reduced ? 0 : 0.28, ease: EXIT_EASE },
            }}
          >
            <div className="shell flex h-16 items-center">
              <Wordmark className="text-md" />
              <button
                type="button"
                onClick={closeMenu}
                aria-label="Close menu"
                autoFocus
                className={
                  "ml-auto inline-flex size-11 items-center justify-center rounded-sm " +
                  "text-ink hover:bg-wg-50 focus-visible:focus-ring"
                }
              >
                <X size={20} strokeWidth={1.5} aria-hidden="true" />
              </button>
            </div>

            {/* Links and the board CTA dismiss without the focus hand-back that
                closeMenu does: navigation is about to move focus anyway, and
                yanking it to a now-hidden trigger first would fight that. */}
            <nav aria-label="Main" className="shell flex flex-col gap-1 pt-4">
              {NAV_LINKS.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={() => setMenuOpen(false)}
                  className={
                    "rounded-sm px-3 py-3 text-md font-medium text-ink " +
                    "hover:bg-wg-50 focus-visible:focus-ring"
                  }
                >
                  {link.label}
                </Link>
              ))}
              <div className="mt-4 flex flex-col gap-3 border-t border-border pt-6">
                <NewBoardButton size="lg" onNavigate={() => setMenuOpen(false)}>
                  New board
                </NewBoardButton>
                <UserMenu size="lg" onNavigate={() => setMenuOpen(false)} />
              </div>
            </nav>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </>
  );
}
