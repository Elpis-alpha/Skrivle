// Status, stated plainly — §13.5. The board itself isn't built yet and the page
// says so here rather than letting a visitor find out by clicking.

import { Reveal } from "@/components/motion/Reveal";

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
    state: "building",
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
// has actually got.
const RAIL: Record<Stage["state"], string> = {
  done: "border-accent",
  building: "border-accent-200",
  planned: "border-border",
};

export function RoadmapRail() {
  return (
    <section id="roadmap" className="scroll-mt-20">
      <div className="shell">
        <Reveal>
          <h2 className="text-xl text-ink">Where it has got to</h2>
          <p className="mt-3 max-w-measure text-base text-ink-secondary">
            Skrivle is mid-build. The canvas is not finished yet, so a board you
            create today opens a placeholder — this is the honest state of it.
          </p>
        </Reveal>

        <ol className="mt-10 grid gap-8 sm:grid-cols-3">
          {STAGES.map((stage) => (
            <li key={stage.phase} className={`border-t-2 pt-4 ${RAIL[stage.state]}`}>
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
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
