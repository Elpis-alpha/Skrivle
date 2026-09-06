// Native <details> so it works on the keyboard, with a screen reader, and
// before the JavaScript arrives. Styled per §10.18.

import { Plus } from "lucide-react";
import { Reveal } from "@/components/motion/Reveal";
import { Button } from "@/components/ui/Button";
import { FAQS } from "@/lib/site";

export function Faq() {
  return (
    <section id="faq" className="scroll-mt-20">
      <div className="shell">
        <Reveal>
          <h2 className="text-xl text-ink">Questions</h2>
        </Reveal>

        <div className="mt-8 max-w-2xl border-t border-border">
          {FAQS.map((entry) => (
            <details key={entry.q} className="group border-b border-border">
              <summary
                className={
                  "flex cursor-pointer list-none items-center gap-4 py-4 text-md " +
                  "font-medium text-ink transition-colors duration-(--dur-fast) " +
                  "ease-standard hover:text-accent-400 focus-visible:focus-ring " +
                  "[&::-webkit-details-marker]:hidden"
                }
              >
                {entry.q}
                <Plus
                  size={18}
                  strokeWidth={1.5}
                  aria-hidden="true"
                  className="ml-auto shrink-0 text-ink-muted transition-transform duration-(--dur-base) ease-standard group-open:rotate-45"
                />
              </summary>
              <p className="max-w-measure pb-5 text-base text-ink-secondary">{entry.a}</p>
            </details>
          ))}
        </div>

        <p className="mt-6 flex flex-wrap items-center gap-3 text-base text-ink-muted">
          Something else on your mind?
          <Button href="/contact" variant="ghost" size="sm">
            Get in touch
          </Button>
        </p>
      </div>
    </section>
  );
}
