import { Check } from "lucide-react";
import type { ReactNode } from "react";
import { Reveal } from "@/components/motion/Reveal";
import { Avatars } from "@/components/illustrations/Avatars";
import { LiveCollaboration } from "@/components/illustrations/LiveCollaboration";
import { WorkingTogether } from "@/components/illustrations/WorkingTogether";

type Band = {
  id: string;
  title: string;
  body: string;
  points: string[];
  art: ReactNode;
};

const BANDS: Band[] = [
  {
    id: "realtime",
    title: "Edits land while you watch",
    body: "The board is one shared document, not a file people take turns with. Two people can drag the same note at the same time and both moves survive.",
    points: [
      "Live cursors with names, not just coloured dots",
      "Conflict-free merging, so nothing silently overwrites",
      "Designed to reconnect on its own and catch up where it left off",
    ],
    art: <LiveCollaboration className="w-full" />,
  },
  {
    id: "one-link",
    title: "A link is the whole invitation",
    body: "There is no member list to manage and nothing for a guest to install. Send the URL and they are drawing seconds later, from whatever browser they already had open.",
    points: [
      "Guests need no account, ever",
      "Pick your own board address, or take a generated one",
      "Works on a phone as well as a laptop",
    ],
    art: <WorkingTogether className="w-full" />,
  },
  {
    id: "keep",
    title: "Keep the boards worth keeping",
    body: "Boards made without an account clear themselves out after a day, which is usually what you want from a quick sketch. Sign in and the ones you care about stop expiring.",
    points: [
      "Sign in with GitHub or Google — no password to invent",
      "Claim a board you already started as a guest",
      "Everything you own in one place under My Boards",
    ],
    art: <Avatars className="w-full" />,
  },
];

export function Features() {
  return (
    <section id="features" className="scroll-mt-20">
      <div className="shell">
        <Reveal>
          <h2 className="text-xl text-ink">What it does</h2>
        </Reveal>

        <div className="mt-12 flex flex-col gap-20 lg:gap-24">
          {BANDS.map((band, index) => (
            <Reveal
              key={band.id}
              className="grid items-center gap-8 lg:grid-cols-2 lg:gap-16"
            >
              <div className={index % 2 === 1 ? "lg:order-2" : undefined}>
                <h3 className="text-lg text-ink">{band.title}</h3>
                <p className="mt-3 max-w-measure text-base text-ink-secondary">
                  {band.body}
                </p>
                <ul className="mt-5 flex flex-col gap-2">
                  {band.points.map((point) => (
                    <li key={point} className="flex gap-2.5 text-base text-ink-secondary">
                      <Check
                        size={16}
                        strokeWidth={2}
                        className="mt-1 shrink-0 text-accent-400"
                        aria-hidden="true"
                      />
                      <span className="max-w-measure">{point}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className={index % 2 === 1 ? "lg:order-1" : undefined}>{band.art}</div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
