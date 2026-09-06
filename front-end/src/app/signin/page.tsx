import type { Metadata } from "next";
import Link from "next/link";
import { PageShell } from "@/components/site/PageShell";
import { Button } from "@/components/ui/Button";

export const metadata: Metadata = {
  title: "Sign in",
  description: "Sign in to Skrivle with GitHub or Google to keep your boards.",
};

// STYLE_GUIDE.md §10.14 — two provider buttons, one supporting line, no email
// field and no password. Disabled until the back-end exists.
export default function SignInPage() {
  return (
    <PageShell>
      <h1 className="text-lg text-ink">Sign in to Skrivle</h1>
      <p className="mt-2 text-base text-ink-secondary">
        Your boards will be saved to your account.
      </p>

      <div className="mt-6 flex flex-col gap-3">
        <Button variant="secondary" size="md" disabled>
          Continue with GitHub
        </Button>
        <Button variant="secondary" size="md" disabled>
          Continue with Google
        </Button>
      </div>

      <p className="mt-4 text-xs text-ink-muted">
        Sign-in isn&apos;t wired up yet — it arrives with the board itself.
      </p>

      <p className="mt-6 border-t border-border pt-6 text-base text-ink-secondary">
        You don&apos;t need an account to draw.{" "}
        <Link
          href="/"
          className="rounded-sm text-ink underline decoration-border underline-offset-4 hover:decoration-accent focus-visible:focus-ring"
        >
          Start a board instead
        </Link>
        .
      </p>
    </PageShell>
  );
}
