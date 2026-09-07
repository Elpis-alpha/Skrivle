"use client";

// GitHub / Google, rendered only where the deployment actually has credentials
// (GET /api/auth/me reports `methods`). A button for a provider the server
// can't serve is a promise it can't keep.

import { Button } from "@/components/ui/Button";
import { startOAuth } from "@/lib/api/auth";
import type { OAuthProvider } from "@/lib/api/types";
import { useSession } from "@/lib/session/SessionProvider";

const LABELS: Record<OAuthProvider, string> = {
  github: "Continue with GitHub",
  google: "Continue with Google",
};

export function OAuthButtons({
  returnTo,
  claim,
}: {
  returnTo?: string | null;
  claim?: string | null;
}) {
  const { methods, status } = useSession();

  // Hold the row's height while we find out, so the form doesn't jump (§10.20).
  if (status === "loading") {
    return (
      <div className="flex flex-col gap-3" aria-hidden>
        <div className="h-10 animate-pulse rounded-md bg-wg-100" />
        <div className="h-10 animate-pulse rounded-md bg-wg-100" />
      </div>
    );
  }

  const providers = (["github", "google"] as const).filter((p) => methods[p]);
  if (providers.length === 0) return null;

  return (
    <div className="flex flex-col gap-3">
      {providers.map((provider) => (
        <Button
          key={provider}
          variant="secondary"
          size="md"
          onClick={() => startOAuth(provider, { returnTo, claim })}
        >
          {LABELS[provider]}
        </Button>
      ))}
    </div>
  );
}
