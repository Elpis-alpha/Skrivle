// Auth endpoints. back-end/src/http/routes/auth.ts

import { API_URL } from "./config";
import { apiFetch } from "./fetch";
import type { MeResponse, OAuthProvider, User } from "./types";

/** Never 401s. `user` is null for a guest; `methods` gates the sign-in UI. */
export function getMe(signal?: AbortSignal): Promise<MeResponse> {
  return apiFetch<MeResponse>("/api/auth/me", { ...(signal ? { signal } : {}) });
}

/**
 * Returns 200 identically whether the address exists, whether mail was sent, or
 * whether a resend was suppressed by the 60s cooldown — it is deliberately not
 * an account-existence oracle. Never tell the user "sent!" on the strength of
 * this; show the cooldown countdown instead.
 */
export function requestEmailCode(
  email: string,
): Promise<{ ok: true; expiresInSeconds: number; code?: string }> {
  return apiFetch("/api/auth/email/request", {
    method: "POST",
    body: { email },
  });
}

export function verifyEmailCode(
  email: string,
  code: string,
): Promise<{ user: User }> {
  return apiFetch("/api/auth/email/verify", {
    method: "POST",
    body: { email, code },
  });
}

export function logout(): Promise<void> {
  return apiFetch<void>("/api/auth/logout", { method: "POST" });
}

/**
 * Mirrors the server's `safeReturnTo` (back-end/src/auth/oauth/flow.ts): a
 * returnTo that isn't a same-origin path is silently rewritten to "/" there.
 * Failing loudly here turns a mysterious redirect into a caught mistake.
 */
export function sameOriginPath(path: string | null | undefined): string | null {
  if (!path) return null;
  if (!path.startsWith("/") || path.startsWith("//")) return null;
  return path;
}

export function oauthSignInUrl(
  provider: OAuthProvider,
  opts: { returnTo?: string | null; claim?: string | null } = {},
): string {
  const params = new URLSearchParams();
  const returnTo = sameOriginPath(opts.returnTo);
  if (returnTo) params.set("returnTo", returnTo);
  if (opts.claim) params.set("claim", opts.claim);
  const query = params.toString();
  return `${API_URL}/api/auth/${provider}${query ? `?${query}` : ""}`;
}

/**
 * The browser must NAVIGATE here — never fetch it. This is a cross-origin 302
 * to GitHub/Google; fetching would hit CORS and, even if it didn't, would
 * follow the redirect in the background and never set a cookie in the
 * top-level frame.
 */
export function startOAuth(
  provider: OAuthProvider,
  opts: { returnTo?: string | null; claim?: string | null } = {},
): void {
  window.location.href = oauthSignInUrl(provider, opts);
}
