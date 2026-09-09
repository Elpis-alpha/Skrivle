import { RevealItem, Stagger } from "@/components/motion/Reveal";
import { DesignSprint } from "@/components/illustrations/DesignSprint";
import { Button } from "@/components/ui/Button";
import { SITE } from "@/lib/site";

export function OpenSource() {
  return (
    <section id="open-source" className="scroll-mt-20 bg-wg-50 py-20 lg:py-24">
      <div className="shell">
        <Stagger
          stagger={0.12}
          className="grid items-center gap-10 lg:grid-cols-[1.1fr_1fr] lg:gap-16"
        >
          <RevealItem>
            <h2 className="text-xl text-ink">Built in the open</h2>

            <div className="mt-4 flex max-w-measure flex-col gap-4 text-base text-ink-secondary">
              <p>
                Skrivle is a portfolio project and every part of it is public as
                it gets written — the architecture notes, the design system this
                page is built from, and the code. MIT licensed, so take any of it.
              </p>
              <p>
                It is being written almost entirely with Claude Code,
                deliberately. The interesting question was not whether an AI can
                produce a landing page, but whether it can hold a real system
                together: a CRDT sync model, OAuth, a database schema, and a
                design system that stays consistent across every screen.
              </p>
              <p>
                Which is why the hard parts aren&apos;t being cut. The sync layer
                is specified as a real Yjs document relayed over Socket.IO rather
                than a polling loop, and sign-in as real OAuth rather than a
                mocked session. The decisions are written down in the
                architecture notes before the code lands, so you can judge the
                reasoning and not just the result.
              </p>
            </div>

            <div className="mt-8 flex flex-wrap gap-3">
              <Button href={SITE.repo} variant="secondary">
                Read the source
              </Button>
              <Button href="/#roadmap" variant="ghost">
                What&apos;s built so far
              </Button>
            </div>
          </RevealItem>

          {/* --surface, not the wg-50 plate the other bands use: this band is
              already tinted, so the art needs to come forward, not recede. */}
          <RevealItem>
            <div className="rounded-lg bg-surface p-6">
              <DesignSprint className="w-full" />
            </div>
          </RevealItem>
        </Stagger>
      </div>
    </section>
  );
}
