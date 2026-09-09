// Status, stated plainly — §13.5. Phase 0 and 1 are done and live; Phase 2 (the
// native app) is what's left, and the page says so here rather than leaving a
// visitor to guess.

import { Reveal, RevealChild, RevealItem, Stagger } from "@/components/motion/Reveal";
import type { Variants } from "motion/react";

type Stage = {
  phase: string;
  title: string;
  state: "done" | "building" | "planned";
  items: string[];
};

const STAGES: Stage[] = [
  {
    phase: "Phase 0",
    title: "Groundwork",
    state: "done",
    items: ["Architecture and design system", "Front-end scaffold", "This page"],
  },
  {
    phase: "Phase 1",
    title: "The board",
    state: "done",
    items: ["Canvas, tools, pan and zoom", "Live sync and cursors", "Sign-in and My Boards"],
  },
  {
    phase: "Phase 2",
    title: "On your phone",
    state: "planned",
    items: ["React Native viewer", "Light editing on the move"],
  },
];

const STATE_LABEL: Record<Stage["state"], string> = {
  done: "Done",
  building: "In progress",
  planned: "Planned",
};

// The rail doubles as a progress bar: the top rule fills in as far as the work
// has actually got. It is a background rather than a border so it can be scaled
// — §13.2's one band-internal move, and it earns the exception by saying
// something true about the band rather than decorating it.
const RAIL: Record<Stage["state"], string> = {
  done: "bg-accent",
  building: "bg-accent-200",
  planned: "bg-border",
};

// scaleX only ever shrinks the rule below its natural width, so it cannot push
// an element's right edge outward — the constraint §13.2 names.
const RULE: Variants = {
  hidden: { scaleX: 0 },
  shown: {
    scaleX: 1,
    transition: { duration: 0.32, ease: [0.3, 0, 0, 1], delay: 0.08 },
  },
};

export function RoadmapRail() {
  return (
    <section id="roadmap" className="scroll-mt-20">
      <div className="shell">
        <Reveal>
          <h2 className="text-xl text-ink">Where it has got to</h2>
          <p className="mt-3 max-w-measure text-base text-ink-secondary">
            The web app — board, live sync, sign-in — is done and live. The
            native app is what&apos;s left; here&apos;s where that stands.
          </p>
        </Reveal>

        <Stagger as="ol" stagger={0.08} className="mt-10 grid gap-8 sm:grid-cols-3">
          {STAGES.map((stage) => (
            <RevealItem key={stage.phase} as="li" className="relative pt-4">
              <RevealChild
                as="span"
                aria-hidden={true}
                variants={RULE}
                className={`absolute inset-x-0 top-0 h-0.5 origin-left ${RAIL[stage.state]}`}
              />
              <div className="flex items-center gap-2">
                {/* Static, not a pulse: the hero mock has already spent this
                    page's one ambient loop (§13.2). */}
                {stage.state === "building" ? (
                  <span className="size-2 rounded-pill bg-accent" aria-hidden="true" />
                ) : null}
                <span className="text-sm font-medium text-ink-muted">{stage.phase}</span>
                <span
                  className={
                    "ml-auto rounded-pill px-2 py-0.5 text-2xs font-medium " +
                    (stage.state === "done"
                      ? "bg-success-subtle text-success"
                      : stage.state === "building"
                        ? "bg-accent-subtle text-accent-400"
                        : "bg-wg-100 text-ink-secondary")
                  }
                >
                  {STATE_LABEL[stage.state]}
                </span>
              </div>

              <h3 className="mt-2 text-md font-semibold text-ink">{stage.title}</h3>
              <ul className="mt-3 flex flex-col gap-1.5">
                {stage.items.map((item) => (
                  <li key={item} className="text-base text-ink-secondary">
                    {item}
                  </li>
                ))}
              </ul>
            </RevealItem>
          ))}
        </Stagger>
      </div>
    </section>
  );
}
