// GitHub and Google OAuth: endpoints, scopes, and profile normalisation.
//
// Hand-rolled rather than pulled from a library. Two providers with stable,
// well-documented endpoints is a small amount of code, it keeps the dependency
// surface of an auth path minimal, and "genuine auth design, not a toy demo"
// is an explicit goal in PROJECT_BRIEF.md. The seam is narrow enough that
// swapping in a library later touches only this file and ./flow.ts.
import type { ProviderProfile } from "../identity.js";
import { config } from "../../config/env.js";

export type ProviderName = "github" | "google";

export type ProviderConfig = {
  name: ProviderName;
  authorizeUrl: string;
  tokenUrl: string;
  scope: string;
  /** Google supports PKCE; GitHub OAuth Apps ignore it. */
  usesPkce: boolean;
  clientId: () => string;
  clientSecret: () => string;
  /** Turn a token response into a normalised profile. */
  fetchProfile: (tokens: TokenResponse) => Promise<ProviderProfile>;
};

export type TokenResponse = {
  access_token: string;
  id_token?: string;
  token_type?: string;
  scope?: string;
};

const GITHUB_API = "https://api.github.com";

type GitHubUser = { id: number; login: string; name: string | null; avatar_url: string | null };
type GitHubEmail = { email: string; primary: boolean; verified: boolean };

async function githubProfile(tokens: TokenResponse): Promise<ProviderProfile> {
  const headers = {
    Authorization: `Bearer ${tokens.access_token}`,
    Accept: "application/vnd.github+json",
    "User-Agent": "skrivle",
  };

  const [userRes, emailRes] = await Promise.all([
    fetch(`${GITHUB_API}/user`, { headers }),
    fetch(`${GITHUB_API}/user/emails`, { headers }),
  ]);
  if (!userRes.ok) throw new Error(`GitHub /user returned ${userRes.status}`);

  const user = (await userRes.json()) as GitHubUser;

  // GitHub's /user.email is the *public* profile email, which is often null and
  // is not necessarily verified. /user/emails (needs the user:email scope) is
  // the authoritative list, so the primary verified address comes from there.
  let email: string | undefined;
  let emailVerified = false;
  if (emailRes.ok) {
    const emails = (await emailRes.json()) as GitHubEmail[];
    const chosen = emails.find((e) => e.primary && e.verified) ?? emails.find((e) => e.verified);
    if (chosen) {
      email = chosen.email;
      emailVerified = true;
    }
  }

  if (!email) throw new NoVerifiedEmail("github");

  return {
    provider: "github",
    providerAccountId: String(user.id),
    email,
    emailVerified,
    name: user.name ?? user.login,
    avatarUrl: user.avatar_url ?? undefined,
  };
}

type GoogleIdToken = {
  sub: string;
  email?: string;
  email_verified?: boolean | string;
  name?: string;
  picture?: string;
};

async function googleProfile(tokens: TokenResponse): Promise<ProviderProfile> {
  if (!tokens.id_token) throw new Error("Google token response carried no id_token.");

  // The signature is not verified here, and does not need to be: this token
  // came back over TLS directly from Google's token endpoint in response to our
  // own code exchange, which is the carve-out in OIDC Core 3.1.3.7. Signature
  // checking matters when a token arrives by some other route (e.g. from the
  // browser), which is not the case in an authorization-code flow.
  const claims = decodeJwtPayload<GoogleIdToken>(tokens.id_token);

  if (!claims.email) throw new NoVerifiedEmail("google");
  // The claim is spec'd as a boolean but has historically been serialised as
  // the string "true" by some Google endpoints.
  const emailVerified = claims.email_verified === true || claims.email_verified === "true";
  if (!emailVerified) throw new NoVerifiedEmail("google");

  return {
    provider: "google",
    providerAccountId: claims.sub,
    email: claims.email,
    emailVerified,
    name: claims.name ?? claims.email.split("@")[0],
    avatarUrl: claims.picture,
  };
}

/** Read a JWT's payload without verifying it. See the note in googleProfile. */
function decodeJwtPayload<T>(jwt: string): T {
  const parts = jwt.split(".");
  if (parts.length !== 3) throw new Error("Malformed id_token.");
  return JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8")) as T;
}

/** A provider account with no usable verified address cannot sign in. */
export class NoVerifiedEmail extends Error {
  constructor(public readonly provider: ProviderName) {
    super(`No verified email address available from ${provider}.`);
    this.name = "NoVerifiedEmail";
  }
}

export const PROVIDERS: Record<ProviderName, ProviderConfig> = {
  github: {
    name: "github",
    authorizeUrl: "https://github.com/login/oauth/authorize",
    tokenUrl: "https://github.com/login/oauth/access_token",
    // read:user for the profile, user:email for the verified address list.
    scope: "read:user user:email",
    usesPkce: false,
    clientId: () => config.oauth.github.clientId,
    clientSecret: () => config.oauth.github.clientSecret,
    fetchProfile: githubProfile,
  },
  google: {
    name: "google",
    authorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    scope: "openid email profile",
    usesPkce: true,
    clientId: () => config.oauth.google.clientId,
    clientSecret: () => config.oauth.google.clientSecret,
    fetchProfile: googleProfile,
  },
};

export function isProviderName(value: string): value is ProviderName {
  return value === "github" || value === "google";
}
