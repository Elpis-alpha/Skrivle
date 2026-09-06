import type { Metadata } from "next";
import Image from "next/image";
import { PageHeader, Prose } from "@/components/site/PageHeader";
import { Button } from "@/components/ui/Button";
import { InTheOffice } from "@/components/illustrations/InTheOffice";
import { AUTHOR, AUTHOR_PHOTOS, SITE } from "@/lib/site";

export const metadata: Metadata = {
  title: "About",
  description: `Skrivle is a live collaborative whiteboard built in the open by ${AUTHOR.name}.`,
};

const PHOTOS = [
  { src: AUTHOR_PHOTOS.corporate, alt: `${AUTHOR.name}, in a suit` },
  { src: AUTHOR_PHOTOS.native, alt: `${AUTHOR.name}, in traditional dress` },
  { src: AUTHOR_PHOTOS.stylish, alt: `${AUTHOR.name}, off duty` },
];

export default function AboutPage() {
  return (
    <>
      <PageHeader
        title="About Skrivle"
        lead="A live collaborative whiteboard, and a demonstration that an AI-assisted build can carry a real system rather than a demo."
      />

      <Prose>
        <h2>What it is</h2>
        <p>
          Open a board, send the link, draw together. No account, no download,
          nothing to install. Boards made without signing in last a day; sign in
          and the ones you keep stop expiring.
        </p>
        <p>
          Underneath, a board is a single Yjs document — a CRDT — relayed over
          Socket.IO and saved as a binary snapshot rather than picked apart into
          database rows. That is what makes two people dragging the same note at
          the same moment resolve instead of collide.
        </p>

        <h2>Why it exists</h2>
        <p>
          Skrivle is a portfolio project with three jobs. It shows real-time
          systems work rather than describing it. It can be judged by a stranger
          in ten seconds, because there is no login wall to get past. And it was
          written almost entirely with Claude Code, as an honest test of what
          that workflow can hold together.
        </p>
        <p>
          That last part is why the unglamorous pieces are real: OAuth, a
          database schema, an expiry sweep, and a design system written down
          before any screen was built. Skipping those would have made the
          exercise meaningless.
        </p>

        <h2>Where it has got to</h2>
        <p>
          The groundwork is done and the canvas is being built now. A phone app
          follows after that. The{" "}
          <a href={`${SITE.repo}/blob/main/docs/ROADMAP.md`}>roadmap</a> is public
          and current.
        </p>
      </Prose>

      <div className="shell">
        <InTheOffice className="mx-auto w-full max-w-2xl" />
      </div>

      <section className="shell py-16">
        <h2 className="text-xl text-ink">Who built it</h2>

        <div className="mt-8 grid gap-10 lg:grid-cols-[1fr_1.2fr] lg:gap-16">
          <ul className="grid grid-cols-3 gap-3 lg:max-w-sm">
            {PHOTOS.map((photo) => (
              <li key={photo.src}>
                <Image
                  src={photo.src}
                  alt={photo.alt}
                  width={320}
                  height={400}
                  className="aspect-4/5 w-full rounded-md border border-border object-cover"
                />
              </li>
            ))}
          </ul>

          <div>
            <h3 className="text-lg text-ink">{AUTHOR.name}</h3>
            <p className="mt-1 text-base text-ink-muted">
              {AUTHOR.role}, writing as {AUTHOR.handle}
            </p>

            <div className="mt-4 flex max-w-measure flex-col gap-4 text-base text-ink-secondary">
              <p>
                A software engineer with {AUTHOR.years}, working mostly on
                scalable web applications and the systems behind them. It started
                as curiosity about how the web actually fits together and turned
                into a career spent on high-quality digital experiences.
              </p>
              <p>
                Skrivle grew out of earlier work on delta-update sync and
                Socket.IO pipelines — the same problem, revisited without the
                deadline, and done in public this time.
              </p>
            </div>

            <h4 className="mt-8 text-base font-medium text-ink">Interested in</h4>
            <ul className="mt-3 flex flex-wrap gap-2">
              {AUTHOR.interests.map((interest) => (
                <li
                  key={interest}
                  className="rounded-pill bg-wg-100 px-3 py-1 text-sm text-ink-secondary"
                >
                  {interest}
                </li>
              ))}
            </ul>

            <div className="mt-8 flex flex-wrap gap-3">
              <Button href={AUTHOR.about} variant="secondary" size="sm">
                Full profile
              </Button>
              {AUTHOR.socials.map((social) => (
                <Button key={social.label} href={social.href} variant="ghost" size="sm">
                  {social.label}
                </Button>
              ))}
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
