"use client";

// A question that unfolds its answer. Native <details>/<summary> underneath, so
// it works on the keyboard, with a screen reader, and before the JavaScript
// arrives; once mounted, the answer's height is animated (§7 --dur-base,
// --ease-standard) instead of snapping.
//
// Two things the obvious implementation gets wrong:
//
// 1. The `open` attribute is set imperatively rather than rendered. The element
//    has to stay open through the whole collapse — the browser would otherwise
//    hide the answer before it finished collapsing — and leaving the attribute
//    out of React's hands also means a click that lands before hydration isn't
//    snapped shut a moment later.
//
// 2. Until mount, and under prefers-reduced-motion, the plain markup renders and
//    the browser does its own instant toggle. Wrapping the answer in an element
//    animating up from height 0 would bake a collapsed answer into the HTML,
//    hiding content on a page whose JavaScript never arrives.

import { Plus } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState, type MouseEvent, type ReactNode } from "react";
import { useMounted } from "@/components/motion/useMounted";

const DURATION = 0.18; // --dur-base
const EASE = [0.2, 0, 0, 1] as const; // --ease-standard

const SUMMARY =
  "flex cursor-pointer list-none items-center gap-4 py-4 text-md font-medium " +
  "text-ink transition-colors duration-(--dur-fast) ease-standard " +
  "hover:text-accent-400 focus-visible:focus-ring " +
  "[&::-webkit-details-marker]:hidden";

const ICON =
  "ml-auto shrink-0 text-ink-muted transition-transform " +
  "duration-(--dur-base) ease-standard";

export function Disclosure({
  summary,
  children,
  className = "",
}: {
  summary: string;
  children: ReactNode;
  className?: string;
}) {
  const reduced = useReducedMotion();
  const animated = useMounted() && !reduced;
  const element = useRef<HTMLDetailsElement>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    // A click that beat hydration opened it without going through `toggle`.
    if (element.current?.open) setOpen(true);
  }, []);

  function toggle(event: MouseEvent<HTMLElement>) {
    const details = element.current;
    if (!animated || !details) return; // the browser's own toggle is the behaviour

    event.preventDefault();
    if (!open) details.open = true; // reveal it, then animate into the space
    setOpen(!open);
  }

  /** Find-in-page expands a closed <details> on its own; follow it open. */
  function sync() {
    if (animated && element.current?.open && !open) setOpen(true);
  }

  const answer = <p className="max-w-measure pb-5 text-base text-ink-secondary">{children}</p>;

  return (
    <details ref={element} className={`group ${className}`} onToggle={sync}>
      <summary className={SUMMARY} onClick={toggle}>
        {summary}
        <Plus
          size={18}
          strokeWidth={1.5}
          aria-hidden="true"
          className={`${ICON} ${animated ? (open ? "rotate-45" : "") : "group-open:rotate-45"}`}
        />
      </summary>

      {animated ? (
        <motion.div
          className="overflow-hidden"
          initial={false}
          animate={{ height: open ? "auto" : 0, opacity: open ? 1 : 0 }}
          transition={{ duration: DURATION, ease: EASE }}
          onAnimationComplete={() => {
            // Only now is it safe to let the browser take the answer away.
            if (!open && element.current) element.current.open = false;
          }}
        >
          {answer}
        </motion.div>
      ) : (
        answer
      )}
    </details>
  );
}
