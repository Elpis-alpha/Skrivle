import type { Metadata } from "next";
import { PageHeader } from "@/components/site/PageHeader";
import { Button } from "@/components/ui/Button";
import { FAQS, SITE, type FaqEntry } from "@/lib/site";

export const metadata: Metadata = {
  title: "FAQ",
  description: "How Skrivle boards, sharing, sign-in, and expiry actually work.",
};

// The landing page carries FAQS; these are the longer answers that need room.
const DEEPER: readonly FaqEntry[] = [
  {
    q: "Why is there no view-only mode?",
    a: "Because permissions that look granular but aren't enforced properly are worse than none. The first version has two roles, owner and editor, and both can edit. A read-only role is a real piece of work in the sync layer, not a checkbox, so it waits until it can be done correctly.",
  },
  {
    q: "What happens if I lose connection mid-drawing?",
    a: "The sync model is built so your edits keep applying locally, and when the connection returns your copy and the server's merge rather than one overwriting the other. The interface is specified to show a bar while you're disconnected, so you're never left guessing.",
  },
  {
    q: "Can I use my own board address?",
    a: "Yes — choose one when you create the board instead of taking the generated five characters. It has to be unique, and it cannot be changed afterwards, because links people already hold would break.",
  },
  {
    q: "Is there an export?",
    a: "Not in the first version. PNG and PDF export is a known gap rather than a decision against it.",
  },
  {
    q: "Will there be a mobile app?",
    a: "A React Native viewer is planned after the web board is finished, starting read-only and gaining light editing. The web version is built to work on a phone too.",
  },
  {
    q: "How much of this was written by AI?",
    a: "Nearly all of it, with Claude Code, and that is the point rather than an admission. Every architectural decision was made deliberately and is written down in the public docs, so you can judge the reasoning and not just the output.",
  },
];

function Section({ heading, entries }: { heading: string; entries: readonly FaqEntry[] }) {
  return (
    <section className="shell py-12">
      <h2 className="text-lg text-ink">{heading}</h2>
      <dl className="mt-6 max-w-2xl border-t border-border">
        {entries.map((entry) => (
          <div key={entry.q} className="border-b border-border py-5">
            <dt className="text-md font-medium text-ink">{entry.q}</dt>
            <dd className="mt-2 max-w-measure text-base text-ink-secondary">{entry.a}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

export default function FaqPage() {
  return (
    <>
      <PageHeader
        title="Questions"
        lead="Everything from the landing page, plus the ones that needed more than two sentences."
      />

      <Section heading="The basics" entries={FAQS} />
      <Section heading="Going deeper" entries={DEEPER} />

      <div className="shell pb-16">
        <p className="text-base text-ink-secondary">
          Still unanswered? The source is the most complete answer there is.
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <Button href={SITE.repo} variant="secondary" size="sm">
            Read the source
          </Button>
          <Button href="/contact" variant="ghost" size="sm">
            Get in touch
          </Button>
        </div>
      </div>
    </>
  );
}
