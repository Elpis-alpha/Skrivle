"use client";

// The hero's live board preview — the page's one ambient loop (§13.2), and the
// only thing on / that animates without being asked to.
//
// It is a mock: no Yjs, no socket. It exists to show what a shared board looks
// like a second after someone else joins. Under prefers-reduced-motion it holds
// the finished frame.

import { motion, useReducedMotion } from "motion/react";
import { CURSOR_COLORS, NOTE_COLORS } from "@/lib/presence-colors";

const note = (name: string) => NOTE_COLORS.find((n) => n.name === name)!;
const cursor = (name: string) => CURSOR_COLORS.find((c) => c.name === name)!;

const GRAY = note("gray");
const BUTTER = note("butter");
const SKY = note("sky");
const CORAL = cursor("coral");
const TEAL = cursor("teal");

/** §10.10 — arrow with a 1.5px surface outline so any hue reads on any ground. */
function Cursor({ color, name }: { color: (typeof CURSOR_COLORS)[number]; name: string }) {
  return (
    <div className="flex items-start">
      <svg width="18" height="20" viewBox="0 0 18 20" aria-hidden="true" focusable="false">
        <path
          d="M2 1.5 15.5 11 9 11.8 5.8 17.8Z"
          fill={color.base}
          stroke="var(--surface)"
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
      </svg>
      <span
        className="mt-1 -ml-0.5 rounded-pill px-1.5 py-0.5 text-2xs font-medium text-white"
        style={{ backgroundColor: color.label }}
      >
        {name}
      </span>
    </div>
  );
}

function Note({
  color,
  children,
  className,
}: {
  color: (typeof NOTE_COLORS)[number];
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      // §2.5 — note text is --ink, which flips to #F2EEF6 over the dark fills.
      className={
        "rounded-note p-3 text-sm leading-5 text-ink shadow-elev-1 " + (className ?? "")
      }
      style={{ backgroundColor: `light-dark(${color.light}, ${color.dark})` }}
    >
      {children}
    </div>
  );
}

export function BoardMock() {
  const reduced = useReducedMotion();

  // One shared timeline: the stroke draws, then each cursor drifts on its own
  // loop. Reduced motion collapses all of it to the end state.
  const strokeAnimation = reduced
    ? { pathLength: 1 }
    : { pathLength: [0, 1, 1, 0] };

  return (
    <div
      className="relative aspect-4/3 w-full overflow-hidden rounded-md border border-border bg-surface shadow-elev-2"
      role="img"
      aria-label="A Skrivle board holding three sticky notes and a sketch, with two other people's cursors moving across it."
    >
      {/* §4.4 dot grid — the board is paper */}
      <div className="dot-grid absolute inset-0" aria-hidden="true" />

      {/* §10.12 board bar, abbreviated */}
      <div className="relative flex h-9 items-center gap-2 border-b border-border bg-surface px-3">
        <span className="truncate text-xs font-semibold text-ink">Sprint planning</span>
        {/* the expiry chip is the first thing to go when the bar runs out of room */}
        <span className="hidden shrink-0 rounded-pill bg-warning-subtle px-2 py-0.5 text-2xs font-medium text-warning-strong sm:inline-block">
          Expires in 23h
        </span>
        {/* §10.11 avatar cluster: 24px discs, −8px overlap, then a +N chip */}
        <div className="ml-auto flex shrink-0 items-center" aria-hidden="true">
          {[
            { color: CORAL, initial: "M" },
            { color: TEAL, initial: "B" },
          ].map(({ color, initial }) => (
            <span
              key={color.name}
              className="-mr-2 grid size-6 place-items-center rounded-pill text-2xs font-medium text-white ring-2 ring-surface"
              style={{ backgroundColor: color.label }}
            >
              {initial}
            </span>
          ))}
          {/* yours is the amethyst one — --you, so it flips with the theme */}
          <span className="-mr-2 grid size-6 place-items-center rounded-pill bg-you text-2xs font-medium text-accent-on ring-2 ring-surface">
            Y
          </span>
          <span className="ml-3 rounded-pill bg-wg-100 px-1.5 py-0.5 text-2xs font-medium text-ink-secondary">
            +2
          </span>
        </div>
      </div>

      <div className="absolute inset-x-0 bottom-0 top-9" aria-hidden="true">
        {/* Shapes and ink sit under the notes. §10.8: no fill, 2px --ink stroke. */}
        <svg
          className="absolute inset-0 size-full"
          viewBox="0 0 400 300"
          fill="none"
          preserveAspectRatio="none"
        >
          {/* an arrow from the first note toward the circle */}
          <path
            d="M148 86 232 132"
            stroke="var(--ink)"
            strokeWidth="2"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
          <path
            d="m222 122 12 10-16 5"
            stroke="var(--ink)"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
          <rect
            x="40"
            y="146"
            width="98"
            height="58"
            stroke="var(--ink)"
            strokeWidth="2"
            vectorEffect="non-scaling-stroke"
          />
          <circle
            cx="296"
            cy="158"
            r="30"
            stroke="var(--ink)"
            strokeWidth="2"
            vectorEffect="non-scaling-stroke"
          />

          {/* the freehand stroke, drawing itself — the ambient loop */}
          <motion.path
            d="M168 258c26-16 40 2 58-6s12-26 34-24 28 22 50 14"
            stroke="var(--you)"
            strokeWidth="2.5"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
            initial={{ pathLength: reduced ? 1 : 0 }}
            animate={strokeAnimation}
            transition={
              reduced
                ? undefined
                : {
                    duration: 8,
                    times: [0, 0.4, 0.85, 1],
                    repeat: Infinity,
                    ease: "easeInOut",
                  }
            }
          />
        </svg>

        <div className="absolute left-[6%] top-[7%] w-[34%]">
          <Note color={GRAY}>Ship the share link</Note>
        </div>

        <div className="absolute left-[6%] top-[73%] w-[28%]">
          <Note color={BUTTER}>No login wall</Note>
        </div>

        <div className="absolute right-[5%] top-[7%] w-[30%]">
          <Note color={SKY}>Guests can edit</Note>
        </div>

        {/* Two other people, moving. Names always accompany the colour (§2.6). */}
        <motion.div
          className="absolute left-[46%] top-[26%]"
          animate={reduced ? undefined : { x: [0, 30, -16, 0], y: [0, 26, 52, 0] }}
          transition={
            reduced ? undefined : { duration: 9, repeat: Infinity, ease: "easeInOut" }
          }
        >
          <Cursor color={CORAL} name="Maya" />
        </motion.div>

        <motion.div
          className="absolute left-[52%] top-[68%]"
          animate={reduced ? undefined : { x: [0, -18, 34, 0], y: [0, -22, -6, 0] }}
          transition={
            reduced
              ? undefined
              : { duration: 11, repeat: Infinity, ease: "easeInOut", delay: 0.8 }
          }
        >
          <Cursor color={TEAL} name="Ben" />
        </motion.div>
      </div>
    </div>
  );
}
