import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { SignInForm } from "@/components/auth/SignInForm";
import { PageShell } from "@/components/site/PageShell";

export const metadata: Metadata = {
  title: "Sign in",
  description:
    "Sign in to Skrivle with an emailed code, GitHub, or Google to keep your boards.",
};

// STYLE_GUIDE.md §10.14 — email first, then GitHub / Google. No passwords.
export default function SignInPage() {
  return (
    <PageShell>
      <h1 className="text-lg text-ink">Sign in to Skrivle</h1>
      <p className="mt-2 text-base text-ink-secondary">
        Your boards will be saved to your account.
      </p>

      {/* This page is statically prerendered and the form reads search params
          (?next, ?claim, ?error), so the boundary isn't optional — without it
          the production build fails. `next dev` renders on demand and won't
          warn you. */}
      <Suspense fallback={<FormSkeleton />}>
        <SignInForm />
      </Suspense>

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

function FormSkeleton() {
  return (
    <div className="mt-6 flex flex-col gap-4" aria-hidden>
      <div className="h-[74px] animate-pulse rounded-md bg-wg-100" />
      <div className="h-10 animate-pulse rounded-md bg-wg-100" />
    </div>
  );
}
