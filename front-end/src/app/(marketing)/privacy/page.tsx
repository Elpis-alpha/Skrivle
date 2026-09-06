import type { Metadata } from "next";
import { PageHeader, Prose } from "@/components/site/PageHeader";
import { SITE } from "@/lib/site";

export const metadata: Metadata = {
  title: "Privacy",
  description:
    "What Skrivle stores, for how long, and what it deliberately does not collect.",
};

export default function PrivacyPage() {
  return (
    <>
      <PageHeader
        title="Privacy"
        lead="Skrivle is pre-launch, so this describes how the system is designed to behave. It will be revised when the product goes live."
      />

      <Prose>
        <h2>What a board holds</h2>
        <p>
          Everything drawn on a board — notes, shapes, text, freehand strokes —
          is stored as one binary snapshot of the board document. It is not
          indexed, searched, or broken into rows, and it is not read by anyone
          operating the service in the normal course of running it.
        </p>
        <p>
          Live cursors, names, and colours are never stored at all. They exist
          only while you are connected and disappear when you close the tab.
        </p>

        <h2>How long it lasts</h2>
        <ul>
          <li>
            A board created without an account is deleted 24 hours after it is
            made, snapshot included. Whoever created it can extend that by 48
            hours, still without signing in.
          </li>
          <li>
            A board owned by a signed-in account has no expiry, and stays until
            it is deleted.
          </li>
          <li>
            Deletion removes the board record and its snapshots. It is not a
            hidden flag.
          </li>
        </ul>

        <h2>If you sign in</h2>
        <p>
          Sign-in is a one-time code sent to your email address, or OAuth through
          GitHub or Google. For a code, Skrivle stores your email address to
          identify your account and send you the code. For OAuth, it receives a
          provider account id, a display name, and an avatar URL. Either way it
          never sees or stores a password.
        </p>
        <p>
          Signing in while on a guest board lets you claim it, which sets you as
          its owner and clears its expiry.
        </p>

        <h2>Who can see your board</h2>
        <p>
          Anyone with the link can open and edit the board. There is no view-only
          role in the first version, so treat a board link the way you would
          treat a key. Boards are not listed publicly and are not indexed by
          search engines, but the link itself is the whole of the access control.
        </p>

        <h2>What is not collected</h2>
        <ul>
          <li>No advertising trackers and no third-party analytics.</li>
          <li>No selling or sharing of anything you draw.</li>
          <li>
            No email address beyond the one you sign in with, and none at all if
            you use GitHub or Google and they do not share one.
          </li>
        </ul>
        <p>
          Standard server logs — IP address, timestamp, requested path — are kept
          briefly for operating and securing the service.
        </p>

        <h2>Questions</h2>
        <p>
          The code is public, so the answer to most questions is readable at{" "}
          <a href={SITE.repo}>the repository</a>. For anything else,{" "}
          <a href={`${SITE.repo}/issues`}>open an issue</a>.
        </p>
      </Prose>
    </>
  );
}
