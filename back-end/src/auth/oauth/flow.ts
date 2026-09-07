// The OAuth authorization-code dance: build the redirect, keep one-shot state
// in Redis, exchange the code for tokens.
import { createHash, randomBytes } from "node:crypto";
import { PROVIDERS, type ProviderConfig, type ProviderName, type TokenResponse } from "./providers.js";
import { config } from "../../config/env.js";
import { keys, TTL } from "../../redis/keys.js";
import { redis } from "../../redis/client.js";

export type OAuthState = {
  provider: ProviderName;
  /** PKCE code verifier. Empty for providers that do not support PKCE. */
  verifier: string;
  /** Path on the front-end to land on afterwards. Always a path, never a URL. */
  returnTo: string;
  /** A guest board to claim once the session exists. */
  claimBoardId?: string;
};

export type AuthorizeRequest = {
  provider: ProviderName;
  returnTo?: string;
  claimBoardId?: string;
};

/**
 * Build the provider URL to send the browser to, and stash the matching state.
 *
 * `state` is the CSRF defence: it is random, stored server-side, and consumed
 * exactly once on the way back, so a callback the user did not initiate has
 * nothing to match against.
 */
export async function beginAuthorization(req: AuthorizeRequest): Promise<string> {
  const provider = PROVIDERS[req.provider];
  const state = randomBytes(32).toString("base64url");
  const verifier = provider.usesPkce ? randomBytes(32).toString("base64url") : "";

  const record: OAuthState = {
    provider: req.provider,
    verifier,
    returnTo: safeReturnTo(req.returnTo),
    ...(req.claimBoardId ? { claimBoardId: req.claimBoardId } : {}),
  };

  await redis.set(keys.oauthState(state), JSON.stringify(record), { EX: TTL.oauthState });

  const params = new URLSearchParams({
    client_id: provider.clientId(),
    redirect_uri: config.oauth.redirectUri(req.provider),
    scope: provider.scope,
    state,
    response_type: "code",
  });

  if (provider.usesPkce) {
    params.set("code_challenge", challengeFor(verifier));
    params.set("code_challenge_method", "S256");
  }

  return `${provider.authorizeUrl}?${params.toString()}`;
}

/**
 * Consume the stored state. Deleting on read makes the callback single-use, so
 * a replayed callback URL cannot mint a second session.
 */
export async function consumeState(state: string | undefined): Promise<OAuthState | null> {
  if (!state) return null;
  const key = keys.oauthState(state);
  const raw = await redis.get(key);
  if (!raw) return null;
  await redis.del(key);
  return JSON.parse(raw) as OAuthState;
}

/** Trade the authorization code for tokens. */
export async function exchangeCode(
  provider: ProviderConfig,
  code: string,
  verifier: string,
): Promise<TokenResponse> {
  const body = new URLSearchParams({
    client_id: provider.clientId(),
    client_secret: provider.clientSecret(),
    code,
    redirect_uri: config.oauth.redirectUri(provider.name),
    grant_type: "authorization_code",
  });
  if (provider.usesPkce && verifier) body.set("code_verifier", verifier);

  const res = await fetch(provider.tokenUrl, {
    method: "POST",
    // GitHub defaults to form-encoded responses; asking for JSON keeps both
    // providers on one parsing path.
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body,
  });

  if (!res.ok) {
    throw new Error(`${provider.name} token exchange returned ${res.status}`);
  }

  const tokens = (await res.json()) as TokenResponse & { error?: string; error_description?: string };
  // GitHub reports failures as HTTP 200 with an error field in the body.
  if (tokens.error) {
    throw new Error(`${provider.name} token exchange failed: ${tokens.error_description ?? tokens.error}`);
  }
  if (!tokens.access_token) {
    throw new Error(`${provider.name} token exchange returned no access_token`);
  }
  return tokens;
}

function challengeFor(verifier: string): string {
  return createHash("sha256").update(verifier).digest("base64url");
}

/**
 * Constrain the post-sign-in destination to a path on our own front-end.
 *
 * Without this, `?returnTo=https://evil.example` turns the callback into an
 * open redirect that borrows Skrivle's domain for a phishing hop.
 */
export function safeReturnTo(value: string | undefined): string {
  if (!value) return "/";
  // Reject anything that could resolve off-origin: absolute URLs, and
  // protocol-relative "//host" paths.
  if (!value.startsWith("/") || value.startsWith("//")) return "/";
  return value;
}

/** The absolute URL to send the browser to once a session exists. */
export function frontendRedirect(returnTo: string): string {
  return `${config.frontendUrl}${safeReturnTo(returnTo)}`;
}
