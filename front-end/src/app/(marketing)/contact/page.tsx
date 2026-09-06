import type { Metadata } from "next";
import { PageHeader } from "@/components/site/PageHeader";
import { Button } from "@/components/ui/Button";
import { GroupProject } from "@/components/illustrations/GroupProject";
import { AUTHOR, SITE } from "@/lib/site";

export const metadata: Metadata = {
  title: "Contact",
  description: `How to reach ${AUTHOR.name} about Skrivle.`,
};

export default function ContactPage() {
  return (
    <>
      <PageHeader
        title="Get in touch"
        lead="There is no contact form yet. These all reach the same person."
      />

      <div className="shell grid gap-12 py-16 lg:grid-cols-[1fr_1fr] lg:items-center lg:gap-16">
        <div>
          <h2 className="text-lg text-ink">About the project</h2>
          <p className="mt-3 max-w-measure text-base text-ink-secondary">
            Bugs, ideas, and questions about how something works are best raised
            as an issue — they stay public, so the next person with the same
            question finds the answer.
          </p>
          <div className="mt-5">
            <Button href={`${SITE.repo}/issues`} variant="secondary" size="sm">
              Open an issue
            </Button>
          </div>

          <h2 className="mt-12 text-lg text-ink">About work</h2>
          <p className="mt-3 max-w-measure text-base text-ink-secondary">
            For hiring, contracting, or anything that isn&apos;t about the code
            itself, LinkedIn is the quickest route.
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            {AUTHOR.socials.map((social) => (
              <Button key={social.label} href={social.href} variant="secondary" size="sm">
                {social.label}
              </Button>
            ))}
            <Button href={AUTHOR.site} variant="ghost" size="sm">
              elpis.cc
            </Button>
          </div>
        </div>

        <GroupProject className="w-full" />
      </div>
    </>
  );
}
