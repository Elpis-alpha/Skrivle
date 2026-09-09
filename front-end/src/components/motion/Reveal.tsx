"use client";

// STYLE_GUIDE.md §13.2 — the marketing scroll reveal, in one place so
// prefers-reduced-motion is handled once rather than per section.
//
// Reserve this for whole bands arriving. A page where every card and chip
// fades up reads as a template (§13.2).
//
// Two deliberate departures from the obvious implementation:
//
// 1. The server renders plain, visible elements and the animation only starts
//    once mounted. Setting `initial` straight away would bake opacity:0 into
//    the HTML, so a page whose JavaScript never hydrates would hide most of
//    its own content. Nothing off-screen has been seen yet, so switching it to
//    hidden at mount costs the reader nothing.
//
// 2. It doesn't use motion's `whileInView`, which fires only when an element
//    *enters* the viewport. Anything the reader jumps past — a #features anchor
//    from the nav, a restored scroll position, End — never intersects and would
//    stay invisible for good. Here, anything at or above the viewport counts as
//    already seen.

import { motion, useReducedMotion, type Variants } from "motion/react";
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { useMounted } from "@/components/motion/useMounted";

const DURATION = 0.32; // --dur-reveal
const EASE = [0.3, 0, 0, 1] as const; // --ease-entrance
const STAGGER = 0.06; // --stagger-reveal

const VARIANTS = {
  hidden: { opacity: 0, y: 16 },
  shown: { opacity: 1, y: 0 },
} as const;

// Runs before paint, so content already in view is marked shown in the same
// frame the hidden state appears — otherwise the hero blinks once at mount.
// useLayoutEffect warns during SSR, where there is nothing to lay out anyway.
const useBeforePaint = typeof window === "undefined" ? useEffect : useLayoutEffect;

/** True once the element has been seen — or was already behind the reader. */
function useRevealed(enabled: boolean) {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);

  useBeforePaint(() => {
    if (!enabled) return;
    const element = ref.current;
    if (!element) return;

    /** Reached the viewport, or already behind the reader. */
    const reached = () => element.getBoundingClientRect().top < window.innerHeight;

    if (reached()) {
      setShown(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) reveal();
      },
      { threshold: 0.15 },
    );

    // Hoisted so the observer callback above can call them.
    function reveal() {
      setShown(true);
      teardown();
    }
    function check() {
      if (reached()) reveal();
    }
    function teardown() {
      observer.disconnect();
      window.removeEventListener("scroll", check);
    }

    observer.observe(element);

    // The observer reports threshold *crossings*, so a jump straight past this
    // element — a #hash link, a restored scroll position — never reaches it.
    // This catches that, then takes itself off.
    window.addEventListener("scroll", check, { passive: true });
    return teardown;
  }, [enabled]);

  return { ref, shown };
}

type As = "div" | "section" | "ul" | "ol" | "li" | "span";

type RevealProps = {
  children: ReactNode;
  className?: string;
  as?: As;
};

export function Reveal({
  children,
  className,
  delay = 0,
  as = "div",
}: RevealProps & {
  /** Seconds. Use Stagger when siblings should follow each other instead. */
  delay?: number;
}) {
  const reduced = useReducedMotion();
  const mounted = useMounted();
  const animated = mounted && !reduced;
  const { ref, shown } = useRevealed(animated);

  // motion[as] is a union, which collapses the ref type to an impossible
  // intersection. `as` still picks the real element; only the types are pinned.
  const Component = motion[as] as typeof motion.div;
  // Same union-narrowing reason as Component above.
  const Plain = as as "div";

  if (!animated) {
    return (
      <Plain ref={ref} className={className}>
        {children}
      </Plain>
    );
  }

  return (
    <Component
      ref={ref}
      className={className}
      variants={VARIANTS}
      initial={shown ? "shown" : "hidden"}
      animate={shown ? "shown" : "hidden"}
      transition={{ duration: DURATION, ease: EASE, delay }}
    >
      {children}
    </Component>
  );
}

/**
 * Parent for a short run of siblings that should arrive 60ms apart.
 * Children must be <RevealItem> or <RevealChild>.
 */
export function Stagger({
  children,
  className,
  as = "div",
  stagger = STAGGER,
  delayChildren = 0,
}: RevealProps & {
  /** Seconds between siblings. Defaults to --stagger-reveal. */
  stagger?: number;
  /** Seconds before the first sibling starts. */
  delayChildren?: number;
}) {
  const reduced = useReducedMotion();
  const mounted = useMounted();
  const animated = mounted && !reduced;
  const { ref, shown } = useRevealed(animated);

  const Component = motion[as] as typeof motion.div;
  // Same union-narrowing reason as Component above.
  const Plain = as as "div";

  if (!animated) {
    return (
      <Plain ref={ref} className={className}>
        {children}
      </Plain>
    );
  }

  return (
    <Component
      ref={ref}
      className={className}
      initial={shown ? "shown" : "hidden"}
      animate={shown ? "shown" : "hidden"}
      variants={{ shown: { transition: { staggerChildren: stagger, delayChildren } } }}
    >
      {children}
    </Component>
  );
}

export function RevealItem({ children, className, as = "div" }: RevealProps) {
  const reduced = useReducedMotion();
  const mounted = useMounted();
  const Component = motion[as] as typeof motion.div;

  if (!mounted || reduced) {
    const Plain = as;
    return <Plain className={className}>{children}</Plain>;
  }

  return (
    <Component
      className={className}
      variants={{
        hidden: VARIANTS.hidden,
        shown: { ...VARIANTS.shown, transition: { duration: DURATION, ease: EASE } },
      }}
    >
      {children}
    </Component>
  );
}

/**
 * §13.2's one band-internal move: an element that animates on its parent
 * reveal's timing, with variants of its own rather than the standard rise.
 *
 * It reads the enclosing Reveal/Stagger's `hidden`/`shown` label through
 * motion's context, which travels by React context and so survives any plain
 * DOM in between. That inheritance is the reason this exists as a component
 * instead of a bare nested `motion.span`: when the parent falls back to plain
 * markup — not yet mounted, or reduced motion — there is no label to inherit,
 * and a bare motion element would sit in its `hidden` variant for good. This
 * one falls back in step with its parent.
 */
export function RevealChild({
  children,
  className,
  as = "div",
  variants,
  style,
  "aria-hidden": ariaHidden,
}: Omit<RevealProps, "children"> & {
  /** Optional: a decorative rule that only scales if it has nothing inside it. */
  children?: ReactNode;
  variants: Variants;
  style?: React.CSSProperties;
  "aria-hidden"?: boolean;
}) {
  const reduced = useReducedMotion();
  const mounted = useMounted();
  const Component = motion[as] as typeof motion.div;

  if (!mounted || reduced) {
    const Plain = as as "div";
    return (
      <Plain className={className} style={style} aria-hidden={ariaHidden}>
        {children}
      </Plain>
    );
  }

  return (
    <Component
      className={className}
      style={style}
      aria-hidden={ariaHidden}
      variants={variants}
    >
      {children}
    </Component>
  );
}
