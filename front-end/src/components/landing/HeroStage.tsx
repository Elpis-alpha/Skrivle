"use client";

// The hero's stage: the ground layer, the two-column layout, and the parallax
// that runs as the reader leaves the fold (§13.2). Hero.tsx stays a server
// component and hands its two columns in as props — server-rendered content
// passed to a client component is rendered ahead of time and arrives in the RSC
// payload, so nothing in `copy` or `board` is pulled into the client bundle by
// sitting here.
//
// Depth is the whole effect: the ground lags behind the scroll (so it reads as
// far away), the board leads it most (nearest the reader), the copy leads a
// little. Reversing that order looks like a bug rather than like depth.
//
// Three rules this file must not break, all of them enforced by e2e/home.spec.ts:
//
//  1. `y` only — never `x`, never `scale`. The 360px overflow check measures
//     every element's right edge immediately after load, so anything that moves
//     an element sideways or grows it fails, and would fail intermittently,
//     which is worse.
//  2. Never `opacity`. That guard matches on the substring `opacity: 0`, so a
//     scroll-driven `opacity: 0.35` trips it just as `opacity: 0` would.
//  3. One DOM shape, animated or not. The layers are always `motion.div`s and
//     only the `style` prop changes, because swapping element types at mount
//     would remount this subtree — restarting BoardMock's CSS build-in, so the
//     board would assemble itself, then do it again on hydration.

import { motion, useReducedMotion, useScroll, useTransform } from "motion/react";
import { useRef, type ReactNode } from "react";
import { useMounted } from "@/components/motion/useMounted";

const GROUND =
  "hero-ground grid-fade absolute inset-0 -z-10 lg:[--hero-light-x:66%] lg:[--hero-light-y:34%]";

export function HeroStage({ copy, board }: { copy: ReactNode; board: ReactNode }) {
  const reduced = useReducedMotion();
  const mounted = useMounted();
  // Until mount, and always under reduced motion, the layers render with no
  // `style` at all — so the served HTML carries no transform and there is no
  // jump when hydration lands.
  const animated = mounted && !reduced;

  const ref = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start start", "end start"],
  });

  // useTransform clamps to the input range by default, and the section starts
  // below the header rather than at the viewport top, so progress is 0 at first
  // paint and every layer sits untransformed.
  const groundY = useTransform(scrollYProgress, [0, 1], [0, 72]);
  const copyY = useTransform(scrollYProgress, [0, 1], [0, -28]);
  const boardY = useTransform(scrollYProgress, [0, 1], [0, -56]);

  return (
    <section ref={ref} className="relative overflow-hidden">
      {/* the page's ground: the canvas dot grid, plus one light under the board */}
      <motion.div
        className={GROUND}
        style={animated ? { y: groundY } : undefined}
        aria-hidden="true"
      />

      <div className="shell grid items-center gap-12 py-16 lg:grid-cols-[minmax(0,520px)_minmax(0,1fr)] lg:gap-20 lg:py-24">
        {/* min-w-0: grid items default to min-width:auto, so a wide child would
            push the column past the shell instead of shrinking. */}
        <motion.div className="min-w-0" style={animated ? { y: copyY } : undefined}>
          {copy}
        </motion.div>

        <motion.div
          className="min-w-0 lg:pl-8"
          style={animated ? { y: boardY } : undefined}
        >
          {board}
        </motion.div>
      </div>
    </section>
  );
}
