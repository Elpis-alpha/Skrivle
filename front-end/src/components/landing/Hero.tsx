import Link from "next/link";
import { Check } from "lucide-react";
import { BoardMock } from "@/components/landing/BoardMock";
import { HeroStage } from "@/components/landing/HeroStage";
import { JoinBoardForm } from "@/components/landing/JoinBoardForm";
import { NewBoardButton } from "@/components/landing/NewBoardButton";

// §13.6 — three separate facts with real structure, not a middot string.
const FACTS = ["Free", "No sign-up", "Any browser"];

// The page's headline gets annotated, because the product is a whiteboard. The
// squiggle is line art in --accent-400 (§13.4), drawn with the same weight and
// round cap as the freehand stroke on the board beside it, and it draws itself
// at 800ms — inside the board's own build-in, so the two columns read as one
// event rather than as two things that happen to move. left-0/w-full means it
// can never reach past the word it underlines.
//
// The span it sits in must be inline-block. Absolutely positioning against an
// inline box anchors to that box's first fragment and gives w-full no real
// containing block to measure, which renders the squiggle as two stubs under
// the wrong letters. The offset is in em, not px, because the headline steps
// through three sizes: Poppins' em box overhangs the line box by a fixed
// fraction of the font size, so a px offset that clears the baseline at 61px
// would sit on top of the letters at 39px.
function Underline() {
  return (
    <svg
      viewBox="0 0 100 8"
      preserveAspectRatio="none"
      aria-hidden="true"
      focusable="false"
      className="absolute bottom-[-0.09em] left-0 h-2 w-full overflow-visible text-accent-400"
    >
      <path
        d="M1 5.6c16-1.9 33-2.6 49-2.1s33 1.5 49 .9"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
        pathLength="1"
        className="build-draw [--build-delay:800ms]"
      />
    </svg>
  );
}

export function Hero() {
  return (
    <HeroStage
      copy={
        <>
          <h1 className="text-3xl text-balance text-ink sm:text-4xl lg:text-5xl">
            A whiteboard you can share in{" "}
            <span className="relative inline-block whitespace-nowrap">
              one link
              <Underline />
            </span>
            .
          </h1>

          <p className="mt-5 max-w-measure text-md text-ink-secondary">
            No account. No download. Open the link and start drawing — everyone
            on it sees every stroke as it happens.
          </p>

          {/* §13.5 — states the true, current build status rather than
              staying silent on it. The chip reuses the success colour
              RoadmapRail's own "Done" badge uses for this same phase, so the
              two surfaces read as one fact rather than two claims. It stays
              below the h1: above it, it would be an eyebrow label (§13.6). */}
          <p className="mt-6 flex flex-wrap items-center gap-x-3 gap-y-2 text-base text-ink-muted">
            <span className="inline-flex shrink-0 items-center gap-2 rounded-pill bg-success-subtle px-3 py-1 text-success">
              <span className="size-2 rounded-pill bg-success" aria-hidden="true" />
              Live
            </span>
            The whole board works — this isn&apos;t a mockup.
            <Link
              href="/#roadmap"
              className="rounded-sm text-ink underline decoration-border underline-offset-4 transition-colors duration-(--dur-fast) ease-standard hover:decoration-accent focus-visible:focus-ring"
            >
              See what&apos;s next
            </Link>
          </p>

          {/* Both ways in, in one object. Loose on the dot grid they read as
              stray text; on a surface they read as the thing you came to do. */}
          <div className="mt-8 rounded-lg border border-border bg-surface/75 p-5 shadow-elev-1 backdrop-blur-[2px] sm:p-6">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <NewBoardButton size="lg">New board</NewBoardButton>
              <p className="text-base text-ink-muted">Yours in about a second.</p>
            </div>
            <div className="mt-5 border-t border-border pt-5">
              <JoinBoardForm />
            </div>
          </div>

          <ul className="mt-6 flex flex-wrap gap-x-5 gap-y-2">
            {FACTS.map((fact) => (
              <li
                key={fact}
                className="flex items-center gap-2 text-sm text-ink-muted"
              >
                <Check
                  size={14}
                  strokeWidth={2}
                  className="text-accent-400"
                  aria-hidden="true"
                />
                {fact}
              </li>
            ))}
          </ul>
        </>
      }
      board={
        <div className="relative">
          {/* A second board behind this one — true of the product, and it gives
              the card something to sit in front of. lg only: a tilted sheet at
              phone width looks cheap, and a rotated near-full-width element is
              exactly the shape of a horizontal-overflow regression. */}
          <div
            className="absolute inset-0 hidden -rotate-2 rounded-md border border-border bg-surface/70 shadow-elev-1 lg:block"
            style={{ transformOrigin: "80% 100%" }}
            aria-hidden="true"
          />
          <BoardMock />
        </div>
      }
    />
  );
}
