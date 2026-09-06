import Link from "next/link";
import { Check } from "lucide-react";
import { BoardMock } from "@/components/landing/BoardMock";
import { JoinBoardForm } from "@/components/landing/JoinBoardForm";
import { NewBoardButton } from "@/components/landing/NewBoardButton";

// §13.6 — three separate facts with real structure, not a middot string.
const FACTS = ["Free", "No sign-up", "Any browser"];

export function Hero() {
  return (
    <section className="relative overflow-hidden">
      {/* the page's ground: the same dot grid the canvas uses */}
      <div className="dot-grid grid-fade absolute inset-0 -z-10" aria-hidden="true" />

      <div className="shell grid items-center gap-12 py-16 lg:grid-cols-[minmax(0,560px)_minmax(0,1fr)] lg:gap-16 lg:py-24">
        {/* min-w-0: grid items default to min-width:auto, so a wide child would
            push the column past the shell instead of shrinking. */}
        <div className="min-w-0">
          <h1 className="text-3xl text-balance text-ink sm:text-4xl lg:text-5xl">
            A whiteboard you can share in one link.
          </h1>

          <p className="mt-5 max-w-measure text-md text-ink-secondary">
            No account. No download. Open the link and start drawing — everyone
            on it sees every stroke as it happens.
          </p>

          {/* §13.5 — the canvas isn't built, and the reader learns that here
              rather than by clicking a button that goes to a placeholder. */}
          <p className="mt-5 flex flex-wrap items-center gap-x-2 text-base text-ink-muted">
            <span className="size-2 shrink-0 rounded-pill bg-accent" aria-hidden="true" />
            Being built in the open — the canvas isn&apos;t live yet.
            <Link
              href="/#roadmap"
              className="rounded-sm text-ink underline decoration-border underline-offset-4 transition-colors duration-(--dur-fast) ease-standard hover:decoration-accent focus-visible:focus-ring"
            >
              See what works today
            </Link>
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-4">
            <NewBoardButton size="lg">New board</NewBoardButton>
            <p className="text-base text-ink-muted">Yours in about a second.</p>
          </div>

          <div className="mt-8">
            <JoinBoardForm />
          </div>

          <ul className="mt-8 flex flex-wrap gap-x-6 gap-y-2">
            {FACTS.map((fact) => (
              <li key={fact} className="flex items-center gap-2 text-base text-ink-secondary">
                <Check
                  size={16}
                  strokeWidth={2}
                  className="text-accent-400"
                  aria-hidden="true"
                />
                {fact}
              </li>
            ))}
          </ul>
        </div>

        <div className="min-w-0 lg:pl-4">
          <BoardMock />
        </div>
      </div>
    </section>
  );
}
