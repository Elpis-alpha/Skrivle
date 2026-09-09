"use client";

// The hero's board preview: it assembles itself on load, then settles into the
// page's one ambient loop (§13.2).
//
// It is a mock: no Yjs, no socket. It exists to show what a shared board looks
// like a second after someone else joins.
//
// ── The build-in ────────────────────────────────────────────────────────────
// The arrival is CSS (`build-*` in globals.css), not motion/react. The hero is
// on screen at first paint, so a JS entrance would have to ship `opacity:0` in
// the server HTML — which e2e/home.spec.ts forbids — or hide the board at mount,
// painting a finished board and then taking it apart. CSS animates during
// hydration instead, and completes even if the JavaScript never arrives. It also
// means the build-in needs no `reduced` branch: the reduced-motion block in
// globals.css collapses each step onto its end frame.
//
// Delays are literal strings, never interpolated — Tailwind scans source text,
// so a computed `[--build-delay:${n}ms]` would generate no CSS.
//
//   at (ms)  what                                   how          lands
//   ───────────────────────────────────────────────────────────────────
//        0   bar title + expiry chip                build-place    280
//      100   the card's dot grid                    build-fade     380
//      240   note — gray, "Ship the share link"     build-place    520
//      320   note — sky, "Guests can edit"          build-place    600
//      400   note — butter, "No login wall"         build-place    680
//      420   the rectangle draws                    build-draw     800
//      500   the circle draws                       build-draw     900
//      620   avatar M                               build-pop      800
//      680   avatar B                               build-pop      860
//      740   avatar Y  (yours last — you just got here)            920
//      800   the arrow shaft draws                  build-draw    1020
//      800   the "+2" chip                          build-fade     980
//      820   Maya's cursor arrives                  build-place   1140
//      860   Ben's cursor arrives                   build-place   1180
//      980   the arrowhead draws                    build-draw    1120
//   ───────────────────────────────────────────────────────────────────
//     1180   last element lands                          (--dur-build is 1200)
//     1200   the ambient loop begins                            motion/react
//
// The shapes deliberately overlap the notes, so it reads as several people
// working at once rather than as a queue. The notes are the only serial run.
//
// ── The loop ────────────────────────────────────────────────────────────────
// The stroke draws and erases itself; the two cursors drift. Both start at 1.2s
// so they pick up exactly where the build-in stops — the loop's first frame IS
// the build-in's end state, so there is no seam to hide. Under reduced motion
// they hold the finished frame.
//
// Never put `opacity` in a motion `initial`/`animate` here: motion renders
// `initial` into the server HTML, and `opacity:0` there fails home.spec.ts.
// That is why each cursor's arrival is CSS on a wrapper and its drift is JS on
// the element inside it — two elements, two properties, nothing fighting.

import { motion, useReducedMotion } from "motion/react";
import { CursorArrow } from "@/components/board/CursorArrow";
import { CURSOR_COLORS, NOTE_COLORS } from "@/lib/presence-colors";

const note = (name: string) => NOTE_COLORS.find((n) => n.name === name)!;
const cursor = (name: string) => CURSOR_COLORS.find((c) => c.name === name)!;

const GRAY = note("gray");
const BUTTER = note("butter");
const SKY = note("sky");
const CORAL = cursor("coral");
const TEAL = cursor("teal");

/** When the loop takes over, in seconds — --dur-build. */
const LOOP_AT = 1.2;

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

  const strokeAnimation = reduced ? { pathLength: 1 } : { pathLength: [0, 1, 1, 0] };

  return (
    <div
      className="relative aspect-4/3 w-full overflow-hidden rounded-md border border-border bg-surface"
      // §6 — the hero's board is the page's foreground object, so it carries the
      // dialog elevation plus the dark-mode top highlight the token already has.
      style={{ boxShadow: "var(--elev-3), var(--raised-inset)" }}
      role="img"
      aria-label="A Skrivle board holding three sticky notes and a sketch, with two other people's cursors moving across it."
    >
      {/* §4.4 dot grid — the board is paper */}
      <div
        className="dot-grid build-fade absolute inset-0 [--build-delay:100ms]"
        aria-hidden="true"
      />

      {/* §10.12 board bar, abbreviated */}
      <div className="relative flex h-9 items-center gap-2 border-b border-border bg-surface px-3">
        <span className="build-place truncate text-xs font-semibold text-ink">
          Sprint planning
        </span>
        {/* the expiry chip is the first thing to go when the bar runs out of room */}
        <span className="build-place hidden shrink-0 rounded-pill bg-warning-subtle px-2 py-0.5 text-2xs font-medium text-warning-strong sm:inline-block">
          Expires in 23h
        </span>
        {/* §10.11 avatar cluster: 24px discs, −8px overlap, then a +N chip.
            They arrive one at a time, yours last — the board fills up with
            people while you watch. No slide-in: a horizontal move is the one
            thing that could push the cluster past the card's right edge. */}
        <div className="ml-auto flex shrink-0 items-center" aria-hidden="true">
          <span
            className="build-pop -mr-2 grid size-6 place-items-center rounded-pill text-2xs font-medium text-white ring-2 ring-surface [--build-delay:620ms]"
            style={{ backgroundColor: CORAL.label }}
          >
            M
          </span>
          <span
            className="build-pop -mr-2 grid size-6 place-items-center rounded-pill text-2xs font-medium text-white ring-2 ring-surface [--build-delay:680ms]"
            style={{ backgroundColor: TEAL.label }}
          >
            B
          </span>
          {/* yours is the amethyst one — --you, so it flips with the theme */}
          <span className="build-pop -mr-2 grid size-6 place-items-center rounded-pill bg-you text-2xs font-medium text-accent-on ring-2 ring-surface [--build-delay:740ms]">
            Y
          </span>
          <span className="build-fade ml-3 rounded-pill bg-wg-100 px-1.5 py-0.5 text-2xs font-medium text-ink-secondary [--build-delay:800ms] [--build-dur:180ms]">
            +2
          </span>
        </div>
      </div>

      <div className="absolute inset-x-0 bottom-0 top-9" aria-hidden="true">
        {/* Shapes and ink sit under the notes. §10.8: no fill, 2px --ink stroke.
            The rectangle and circle are paths rather than <rect>/<circle> so
            they can draw themselves: pathLength on a basic shape is SVG2 and
            unevenly supported, and a path also lets the pen start at a corner
            (rect) and at twelve o'clock (circle) rather than wherever the
            browser chooses. */}
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
            pathLength="1"
            className="build-draw [--build-delay:800ms] [--build-dur:220ms]"
          />
          <path
            d="m222 122 12 10-16 5"
            stroke="var(--ink)"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
            pathLength="1"
            className="build-draw [--build-delay:980ms] [--build-dur:140ms]"
          />
          {/* the rectangle: top-left corner, clockwise, closed */}
          <path
            d="M40 146H138V204H40Z"
            stroke="var(--ink)"
            strokeWidth="2"
            vectorEffect="non-scaling-stroke"
            pathLength="1"
            className="build-draw [--build-delay:420ms]"
          />
          {/* the circle: two semicircular arcs from twelve o'clock, clockwise —
              a single 360° arc is degenerate and renders nothing */}
          <path
            d="M296 128A30 30 0 0 1 296 188A30 30 0 0 1 296 128"
            stroke="var(--ink)"
            strokeWidth="2"
            vectorEffect="non-scaling-stroke"
            pathLength="1"
            className="build-draw [--build-delay:500ms] [--build-dur:400ms]"
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
                    // First iteration only — motion does not re-apply a delay
                    // to repeats, so the loop runs unbroken after the build-in.
                    delay: LOOP_AT,
                  }
            }
          />
        </svg>

        {/* Notes are placed, not faded in: each lands out of a slight rotation,
            the way a hand puts one down. Kept under 2° — the sky note sits at
            right-[5%], and a wider angle would swing its corner past the card
            mid-animation, which the 360px overflow check samples for. */}
        <div className="build-place absolute left-[6%] top-[7%] w-[34%] [--build-delay:240ms] [--build-rot:-1.5deg]">
          <Note color={GRAY}>Ship the share link</Note>
        </div>

        <div className="build-place absolute right-[5%] top-[7%] w-[30%] [--build-delay:320ms] [--build-rot:-0.8deg]">
          <Note color={SKY}>Guests can edit</Note>
        </div>

        <div className="build-place absolute left-[6%] top-[73%] w-[28%] [--build-delay:400ms] [--build-rot:1.2deg]">
          <Note color={BUTTER}>No login wall</Note>
        </div>

        {/* Two other people, moving. Names always accompany the colour (§2.6).
            The wrapper does the arrival in CSS; the element inside does the
            drift in JS. See the note at the top of this file. */}
        <div className="build-place absolute left-[46%] top-[26%] [--build-delay:820ms] [--build-dur:320ms]">
          <motion.div
            animate={reduced ? undefined : { x: [0, 30, -16, 0], y: [0, 26, 52, 0] }}
            transition={
              reduced
                ? undefined
                : {
                    duration: 9,
                    repeat: Infinity,
                    ease: "easeInOut",
                    delay: LOOP_AT,
                  }
            }
          >
            <CursorArrow color={CORAL} name="Maya" />
          </motion.div>
        </div>

        <div className="build-place absolute left-[52%] top-[68%] [--build-delay:860ms] [--build-dur:320ms]">
          <motion.div
            animate={reduced ? undefined : { x: [0, -18, 34, 0], y: [0, -22, -6, 0] }}
            transition={
              reduced
                ? undefined
                : {
                    duration: 11,
                    repeat: Infinity,
                    ease: "easeInOut",
                    // A cursor that sits still for a moment after arriving
                    // reads as a person, not as a scheduled animation.
                    delay: LOOP_AT + 0.8,
                  }
            }
          >
            <CursorArrow color={TEAL} name="Ben" />
          </motion.div>
        </div>
      </div>
    </div>
  );
}
