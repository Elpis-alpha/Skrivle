import type { Metadata } from "next";
import Link from "next/link";
import { SignInForm } from "@/components/auth/SignInForm";
import { PageShell } from "@/components/site/PageShell";

export const metadata: Metadata = {
  title: "Sign in",
  description:
    "Sign in to Skrivle with an emailed code, GitHub, or Google to keep your boards.",
};

// STYLE_GUIDE.md §10.14 — email first, then GitHub / Google. No passwords.
// The form is a client component; nothing is wired to the back-end yet.
export default function SignInPage() {
  return (
    <PageShell>
      <h1 className="text-lg text-ink">Sign in to Skrivle</h1>
      <p className="mt-2 text-base text-ink-secondary">
        Your boards will be saved to your account.
      </p>

      <SignInForm />

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
