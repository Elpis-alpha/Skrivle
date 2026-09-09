import { NewBoardButton } from "@/components/landing/NewBoardButton";
import { Reveal } from "@/components/motion/Reveal";

// The hero's bookend: same ground, light centred rather than under the board.
// §13.2 caps it there — no build-in, no parallax, no loop.
export function ClosingCta() {
  return (
    <section className="relative overflow-hidden">
      <div className="hero-ground grid-fade absolute inset-0 -z-10" aria-hidden="true" />
      <div className="shell py-20 text-center lg:py-24">
        <Reveal>
          <h2 className="mx-auto max-w-xl text-2xl text-balance text-ink">
            Open a board and see how far you get before anyone asks who you are.
          </h2>
          <div className="mt-8 flex justify-center">
            <NewBoardButton size="lg">New board</NewBoardButton>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
