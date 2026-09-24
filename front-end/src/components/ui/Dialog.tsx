"use client";

// STYLE_GUIDE.md §10.16 — the dialog base.
//
// "Centered, --surface-raised, --radius-lg, --elev-3, 24px padding, max-width
// 440 (sm) / 560 (md). Scrim rgba(26,22,32,.4) + 2px backdrop blur. Title
// text-lg weight 600. Closes on Esc and scrim click; focus is trapped and
// returns to the trigger on close. Enter/--dur-slow --ease-entrance (scrim
// fade + 8px rise); reduced-motion → fade only."
//
// The shell only: what goes inside, and what closing means, are the caller's.
// `open` is controlled — onClose asks the parent to flip it.

import { X } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useId, useRef, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";

// Same treatment as SiteHeader's mobile panel: scrim fade + 8px rise,
// --dur-slow. Reduced-motion → fade only.
const ENTER_EASE = [0.3, 0, 0, 1] as const; // --ease-entrance
const EXIT_EASE = [0.2, 0, 0, 1] as const; // --ease-standard

const FOCUSABLE =
  "a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), " +
  "select:not([disabled]), [tabindex]:not([tabindex='-1'])";

const WIDTH = { sm: "max-w-110", md: "max-w-140" } as const;

export function Dialog({
  open,
  onClose,
  title,
  size = "sm",
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: React.ReactNode;
  size?: keyof typeof WIDTH;
  children: React.ReactNode;
}) {
  const titleId = useId();
  const reduced = useReducedMotion();
  const panelRef = useRef<HTMLDivElement>(null);

  // The standard SSR-safe portal gate: `document` doesn't exist on the server,
  // so the server snapshot is false and the client one is true. `open` can
  // only become true from a client interaction anyway, so this costs nothing
  // visible.
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );

  // Remember what had focus when the dialog opened, and give it back when it
  // closes — the cleanup runs exactly when `open` flips back to false.
  useEffect(() => {
    if (!open) return;
    const trigger = document.activeElement as HTMLElement | null;
    return () => trigger?.focus?.();
  }, [open]);

  // Focus moves into the dialog on open, unless the content already placed it
  // (an autoFocus field). The panel itself takes it otherwise, so a screen
  // reader lands on the dialog rather than being left on the page behind.
  useEffect(() => {
    if (!open) return;
    const panel = panelRef.current;
    if (panel && !panel.contains(document.activeElement)) panel.focus();
  }, [open]);

  // Body scroll lock: locked the instant it opens, unlocked only once the exit
  // animation finishes (AnimatePresence's onExitComplete below) — not the
  // instant `open` flips, or the page would jump while the dialog is still
  // visibly fading out. And on unmount, in case it never got to exit.
  useEffect(() => {
    if (open) document.body.style.overflow = "hidden";
  }, [open]);
  useEffect(
    () => () => {
      document.body.style.overflow = "";
    },
    [],
  );

  // Esc closes; Tab is kept inside the panel while it's open.
  useEffect(() => {
    if (!open) return;

    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
        return;
      }
      if (event.key !== "Tab") return;

      const focusable = panelRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE);
      if (!focusable?.length) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;

      if (event.shiftKey && (active === first || active === panelRef.current)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    }

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!mounted) return null;

  // Portalled to <body> rather than rendered in place. A non-none
  // backdrop-filter or transform on any ancestor creates a new containing
  // block for `position: fixed` descendants — SiteHeader's blurred bar, the
  // board's camera — which would pin the scrim to that ancestor instead of
  // the viewport. Portalling also keeps stray inherited layout (text-center
  // and the like) out of the panel.
  //
  // The portal itself is unconditional — only its content toggles on `open` —
  // because AnimatePresence has to stay mounted across open→close to run the
  // exit animation at all.
  return createPortal(
    <AnimatePresence onExitComplete={() => (document.body.style.overflow = "")}>
      {open ? (
        <motion.div
          data-testid="dialog-scrim"
          className="fixed inset-0 z-70 flex items-center justify-center bg-[rgba(26,22,32,0.4)] p-4 backdrop-blur-[2px]"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) onClose();
          }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1, transition: { duration: reduced ? 0 : 0.18 } }}
          exit={{ opacity: 0, transition: { duration: reduced ? 0 : 0.18 } }}
        >
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            tabIndex={-1}
            className={`w-full ${WIDTH[size]} rounded-lg bg-surface-raised p-6 shadow-elev-3 outline-none`}
            initial={reduced ? false : { opacity: 0, y: 8 }}
            animate={{
              opacity: 1,
              y: 0,
              transition: { duration: reduced ? 0 : 0.28, ease: ENTER_EASE },
            }}
            exit={{
              opacity: 0,
              y: reduced ? 0 : 8,
              transition: { duration: reduced ? 0 : 0.28, ease: EXIT_EASE },
            }}
          >
            <div className="flex items-start justify-between gap-4">
              <h2 id={titleId} className="text-lg font-semibold text-ink">
                {title}
              </h2>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className={
                  "-m-1.5 inline-flex size-8 shrink-0 items-center justify-center rounded-sm " +
                  "text-ink-secondary hover:bg-wg-50 hover:text-ink focus-visible:focus-ring"
                }
              >
                <X size={18} strokeWidth={1.5} aria-hidden="true" />
              </button>
            </div>

            {children}
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>,
    document.body,
  );
}
