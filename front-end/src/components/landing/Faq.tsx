// Native <details> so it works on the keyboard, with a screen reader, and
// before the JavaScript arrives. Styled per §10.18; the open/close animation
// lives in Disclosure.

import { Reveal } from "@/components/motion/Reveal";
import { Button } from "@/components/ui/Button";
import { Disclosure } from "@/components/ui/Disclosure";
import { FAQS, SITE } from "@/lib/site";

export function Faq() {
  return (
    <section id="faq" className="scroll-mt-20">
      <div className="shell">
        <Reveal>
          <h2 className="text-xl text-ink">Questions</h2>
        </Reveal>

        <Reveal delay={0.06} className="mt-8 max-w-2xl border-t border-border">
          {FAQS.map((entry) => (
            <Disclosure key={entry.q} summary={entry.q} className="border-b border-border">
              {entry.a}
            </Disclosure>
          ))}
        </Reveal>

        <p className="mt-6 flex flex-wrap items-center gap-3 text-base text-ink-muted">
          Something else on your mind?
          <Button href={`${SITE.repo}/issues`} variant="ghost" size="sm">
            Open an issue
          </Button>
        </p>
      </div>
    </section>
  );
}
