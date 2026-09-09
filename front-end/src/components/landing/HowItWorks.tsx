import type { Variants } from "motion/react";
import {
  Reveal,
  RevealChild,
  RevealItem,
  Stagger,
} from "@/components/motion/Reveal";

// Numbered because this genuinely is a sequence — three steps in order, not
// three features wearing numbers.
const STEPS = [
  {
    title: "Create a board",
    body: "One click. You land on a fresh canvas at its own URL, already yours to draw on.",
  },
  {
    title: "Send the link",
    body: "Paste it anywhere. Whoever opens it is on the board — no invite, no account, no waiting room.",
  },
  {
    title: "Draw together",
    body: "Notes, shapes, text, freehand. Everyone's cursor is visible, and nobody's edit overwrites anyone else's.",
  },
];

// The connector draws left-to-right as each step lands, so the sequence
// literally connects itself — §13.2's one band-internal move. clipPath rather
// than scaleX: scaling a dashed border stretches the dashes along with it.
const CONNECTOR: Variants = {
  hidden: { clipPath: "inset(0 100% 0 0)" },
  shown: {
    clipPath: "inset(0 0 0 0)",
    transition: { duration: 0.32, ease: [0.3, 0, 0, 1], delay: 0.16 },
  },
};

export function HowItWorks() {
  return (
    <section id="how-it-works" className="scroll-mt-20">
      <div className="shell">
        <Reveal>
          <h2 className="text-xl text-ink">How it works</h2>
        </Reveal>

        {/* Staggered rather than revealed as one block: the steps are a
            sequence, so arriving in order says something true about them. */}
        <Stagger as="ol" className="mt-10 grid gap-10 sm:grid-cols-3 sm:gap-8">
          {STEPS.map((step, index) => (
            <RevealItem key={step.title} as="li" className="relative">
              {/* the connector: a dashed rule between steps, not under the last */}
              {index < STEPS.length - 1 ? (
                <RevealChild
                  as="span"
                  aria-hidden={true}
                  variants={CONNECTOR}
                  className="absolute left-11 top-4 hidden h-px w-[calc(100%-2rem)] border-t border-dashed border-border-strong sm:block"
                />
              ) : null}

              <span className="relative grid size-8 place-items-center rounded-pill bg-accent-subtle text-base font-medium text-accent-400">
                {index + 1}
              </span>
              <h3 className="mt-4 text-md font-semibold text-ink">{step.title}</h3>
              <p className="mt-2 max-w-measure text-base text-ink-secondary">{step.body}</p>
            </RevealItem>
          ))}
        </Stagger>
      </div>
    </section>
  );
}
