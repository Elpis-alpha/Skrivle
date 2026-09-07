"use client";

// The heading/copy swap here reads only useSession (a plain context, no
// Suspense needed). Both branches under the Suspense boundary — SignInForm
// and ContinueAction — read useSearchParams; keeping exactly one Suspense
// wrapping exactly one of them, same as the original single-branch version,
// is what keeps /signin statically prerendered (`next build` fails without
// it; `next dev` renders on demand and won't warn — see SignInForm's own
// note on this).

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { SignInForm } from "@/components/auth/SignInForm";
import { Button } from "@/components/ui/Button";
import { sameOriginPath } from "@/lib/api/auth";
import { useSession } from "@/lib/session/SessionProvider";

export function SignInPageContent() {
  const { user, status } = useSession();
  const signedIn = status === "ready" && user !== null;

  return (
    <>
      <h1 className="text-lg text-ink">
        {signedIn ? "You're already signed in" : "Sign in to Skrivle"}
      </h1>
      <p className="mt-2 text-base text-ink-secondary">
        {signedIn ? (
          <>
            Signed in as <span className="text-ink">{user!.name}</span>. Your boards are saved
            to this account.
          </>
        ) : (
          "Your boards will be saved to your account."
        )}
      </p>

      <Suspense fallback={<FormSkeleton />}>
        {signedIn ? <ContinueAction /> : <SignInForm />}
      </Suspense>

      <p className="mt-6 border-t border-border pt-6 text-base text-ink-secondary">
        {signedIn ? (
          <>
            Want a fresh board instead?{" "}
            <Link
              href="/"
              className="rounded-sm text-ink underline decoration-border underline-offset-4 hover:decoration-accent focus-visible:focus-ring"
            >
              Start one
            </Link>
            .
          </>
        ) : (
          <>
            You don&apos;t need an account to draw.{" "}
            <Link
              href="/"
              className="rounded-sm text-ink underline decoration-border underline-offset-4 hover:decoration-accent focus-visible:focus-ring"
            >
              Start a board instead
            </Link>
            .
          </>
        )}
      </p>
    </>
  );
}

/** Reads ?next= so "Continue" honours where you were headed, same as SignInForm. */
function ContinueAction() {
  const { signOut } = useSession();
  const params = useSearchParams();
  const destination = sameOriginPath(params.get("next")) ?? "/boards";

  return (
    <div className="mt-6 flex flex-wrap gap-3">
      <Button href={destination} variant="primary" size="md">
        Continue
      </Button>
      <Button variant="ghost" size="md" onClick={() => void signOut()}>
        Sign out
      </Button>
    </div>
  );
}

function FormSkeleton() {
  return (
    <div className="mt-6 flex flex-col gap-4" aria-hidden>
      <div className="h-18.5 animate-pulse rounded-md bg-wg-100" />
      <div className="h-10 animate-pulse rounded-md bg-wg-100" />
    </div>
  );
}
