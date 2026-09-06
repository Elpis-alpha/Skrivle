import Image from "next/image";
import { Reveal } from "@/components/motion/Reveal";
import { Button } from "@/components/ui/Button";
import { AUTHOR, AUTHOR_PHOTOS } from "@/lib/site";

export function DevBand() {
  return (
    <section className="shell">
      <Reveal className="flex flex-col gap-8 sm:flex-row sm:items-center">
        {/* The accent-500 ring is the §10.11 "your own presence" treatment,
            borrowed: on this page the author is the one who is here. */}
        <Image
          src={AUTHOR_PHOTOS.corporate}
          alt={AUTHOR.name}
          width={120}
          height={120}
          className="size-28 shrink-0 rounded-pill object-cover ring-2 ring-accent-500 ring-offset-4 ring-offset-canvas"
        />

        <div>
          <h2 className="text-lg text-ink">Who built this</h2>
          <p className="mt-1 text-base text-ink-muted">
            {AUTHOR.name} — {AUTHOR.role}
          </p>
          <p className="mt-3 max-w-measure text-base text-ink-secondary">
            {AUTHOR.years}. Skrivle came out of earlier work on delta-update
            sync and Socket.IO pipelines — this is that problem, revisited
            without the deadline and built in public.
          </p>

          <div className="mt-5 flex flex-wrap items-center gap-3">
            {/* The site no longer has its own /about page; this goes straight
                to the author's. */}
            <Button href={AUTHOR.about} variant="secondary" size="sm">
              More about me
            </Button>
            {AUTHOR.socials.map((social) => (
              <Button key={social.label} href={social.href} variant="ghost" size="sm">
                {social.label}
              </Button>
            ))}
          </div>
        </div>
      </Reveal>
    </section>
  );
}
