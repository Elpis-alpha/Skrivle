"use client";

// Landing after an OAuth round trip.
//
// The callback always redirects to ${FRONTEND_URL}${returnTo}, adding either
// ?claim=<boardId> on success or ?error=<code> on failure — so either can land
// on /signin, /board/:id or /boards, and each of those mounts this hook.
//
// back-end/src/http/routes/auth.ts

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo } from "react";

export type LandingError = { message: string; next: string };

/** The six codes the callback can send. Copy follows STYLE_GUIDE §10.3. */
export const OAUTH_ERRORS: Record<string, LandingError> = {
  unsupported_provider: {
    message: "That sign-in provider isn't available here.",
    next: "Use an emailed code instead.",
  },
  invalid_state: {
    message: "That sign-in link expired before it came back.",
    next: "Start again from the sign-in page.",
  },
  cancelled: {
    message: "Sign-in was cancelled at the provider.",
    next: "Try again, or use an emailed code.",
  },
  no_verified_email: {
    message: "That account has no verified email address.",
    next: "Verify it with the provider, or sign in with an emailed code.",
  },
  email_in_use: {
    message:
      "That address already belongs to a Skrivle account signed in another way.",
    next: "Sign in the way you did before, or use an emailed code.",
  },
  signin_failed: {
    message: "Sign-in didn't complete.",
    next: "Try again in a moment, or use an emailed code.",
  },
};

export function oauthError(code: string | null | undefined): LandingError | null {
  if (!code) return null;
  // An unknown code still has to say something useful.
  return OAUTH_ERRORS[code] ?? OAUTH_ERRORS.signin_failed;
}

export function useAuthLanding(): {
  error: LandingError | null;
  /** Board id the server was asked to claim; the front-end performs the claim. */
  claim: string | null;
  /** Drop both params so a refresh doesn't re-fire them. */
  clear: () => void;
} {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const errorCode = params.get("error");
  const claim = params.get("claim");

  const error = useMemo(() => oauthError(errorCode), [errorCode]);

  const clear = useCallback(() => {
    const next = new URLSearchParams(params.toString());
    next.delete("error");
    next.delete("claim");
    const query = next.toString();
    router.replace(query ? `${pathname}?${query}` : pathname);
  }, [params, pathname, router]);

  return { error, claim, clear };
}
