import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader, Prose } from "@/components/site/PageHeader";
import { SITE } from "@/lib/site";

export const metadata: Metadata = {
  title: "Terms",
  description: "Terms of use for Skrivle — not yet written; the project is pre-launch.",
};

export default function TermsPage() {
  return (
    <>
      <PageHeader
        title="Terms"
        lead="Not written yet. Skrivle is pre-launch and has no users to hold to anything."
      />

      <Prose>
        <p>
          Proper terms will land alongside the public launch. Until then, the
          honest version is short:
        </p>
        <ul>
          <li>
            Skrivle is a portfolio project offered as-is, with no uptime promise
            and no guarantee your board will still be there tomorrow.
          </li>
          <li>
            Boards made without an account are deleted after 24 hours by design.
            Don&apos;t keep anything on one that you can&apos;t afford to lose.
          </li>
          <li>
            Anyone with a board link can edit that board. Share links
            accordingly.
          </li>
          <li>
            The code is MIT licensed and available at{" "}
            <a href={SITE.repo}>the repository</a>. This page governs the hosted
            service, not the code.
          </li>
        </ul>
        <p>
          The <Link href="/privacy">privacy page</Link> is written and describes what
          the service actually stores.
        </p>
      </Prose>
    </>
  );
}
