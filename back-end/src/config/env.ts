// Typed view of the process environment. See back-end/.env.example.
import { randomBytes } from "node:crypto";

// Node loads no .env of its own, and `tsx watch` cannot take --env-file via
// NODE_OPTIONS. process.loadEnvFile() (Node 20.12+) covers tsx, node, and
// Vitest alike without a dotenv dependency. Real environments (Docker, the
// host) set variables directly and have no file — hence the guard.
try {
  process.loadEnvFile();
} catch {
  /* no .env on disk; the environment is expected to be populated already */
}

const nodeEnv = process.env.NODE_ENV ?? "development";
const isProduction = nodeEnv === "production";

/**
 * Read a required variable. In production a missing value is fatal; in
 * development it falls back to "" so the server can still boot for wiring work.
 */
function required(name: string): string {
  const value = process.env[name];
  if (value === undefined || value === "") {
    if (isProduction) {
      throw new Error(
        `Missing required environment variable ${name}. Set it in the environment or .env.`,
      );
    }
    return "";
  }
  return value;
}

/**
 * A secret that must never silently be the empty string, because "" would make
 * every HMAC in auth/hash.ts unkeyed. Production still fails loudly; development
 * falls back to a value that changes each boot, so sessions simply do not
 * survive a restart — visibly broken beats quietly insecure.
 */
function requiredSecret(name: string): string {
  const value = process.env[name];
  if (value === undefined || value === "" || value === "change-me") {
    if (isProduction) {
      throw new Error(
        `Missing required environment variable ${name}. Generate one with: openssl rand -hex 32`,
      );
    }
    console.warn(
      `[skrivle] ${name} is unset — using a random per-boot value. Sessions will not survive a restart.`,
    );
    return randomBytes(32).toString("hex");
  }
  return value;
}

function port(): number {
  const raw = process.env.PORT ?? "4000";
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0 || parsed > 65535) {
    throw new Error(`PORT must be an integer between 1 and 65535; got "${raw}".`);
  }
  return parsed;
}

/** Trailing slashes break origin comparisons and redirect_uri equality. */
function trimSlash(url: string): string {
  return url.replace(/\/+$/, "");
}

const apiPublicUrl = trimSlash(
  process.env.API_PUBLIC_URL ?? `http://localhost:${process.env.PORT ?? 4000}`,
);

export const config = {
  nodeEnv,
  isProduction,
  port: port(),
  databaseUrl: required("DATABASE_URL"),
  redisUrl: process.env.REDIS_URL ?? "redis://localhost:6379",

  /** Allowed browser origins for CORS and the Socket.IO handshake. */
  corsOrigins: (process.env.CORS_ORIGIN ?? "http://localhost:3000")
    .split(",")
    .map((origin) => trimSlash(origin.trim()))
    .filter(Boolean),
  /** Where OAuth sends the browser once a session exists. */
  frontendUrl: trimSlash(process.env.FRONTEND_URL ?? "http://localhost:3000"),
  /** This server's public base URL — the OAuth redirect_uri is built from it. */
  apiPublicUrl,

  /** HMAC pepper for session ids, sign-in codes, and creator tokens. */
  sessionSecret: requiredSecret("SESSION_SECRET"),

  oauth: {
    github: {
      clientId: process.env.GITHUB_CLIENT_ID ?? "",
      clientSecret: process.env.GITHUB_CLIENT_SECRET ?? "",
    },
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID ?? "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
    },
    /** Must match what is registered with the provider, character for character. */
    redirectUri(provider: "github" | "google"): string {
      return `${apiPublicUrl}/api/auth/callback/${provider}`;
    },
  },

  /** Gmail OAuth2 credentials for the Gmail HTTPS API. See .env.example for the 7-day caveat. */
  mail: {
    clientId: process.env.MAIL_CLIENT_ID ?? "",
    clientSecret: process.env.MAIL_CLIENT_SECRET ?? "",
    refreshToken: process.env.MAIL_REFRESH_TOKEN ?? "",
    address: process.env.MAIL_ADDRESS ?? "",
  },

  cloudinary: {
    cloudName: process.env.CLOUDINARY_CLOUD_NAME ?? "",
    apiKey: process.env.CLOUDINARY_API_KEY ?? "",
    apiSecret: process.env.CLOUDINARY_API_SECRET ?? "",
    folder: process.env.CLOUDINARY_FOLDER ?? "skrivle",
  },
} as const;

/**
 * Test affordance: return sign-in codes in the response instead of mailing
 * them, so an end-to-end test can sign in without an inbox.
 *
 * Ignored in production unconditionally — the `!isProduction` term is not
 * configurable, so setting AUTH_DEV_CODES on a production deployment does
 * nothing at all.
 *
 * It exists because the obvious alternative doesn't work: sendMail logs the
 * code only when mail is unconfigured, and in exactly that state
 * GET /api/auth/me reports methods.email === false, which is what the sign-in
 * UI uses to decide whether to offer the email path at all.
 */
export const devSignInCodes = !isProduction && process.env.AUTH_DEV_CODES === "1";

if (devSignInCodes) {
  console.warn(
    "[skrivle] AUTH_DEV_CODES is on: sign-in codes are returned in the API " +
      "response and no mail is sent. Never use this outside development.",
  );
}

/** True when a subsystem has enough configuration to actually be used. */
export const featureEnabled = {
  // devSignInCodes keeps the email path advertised even with no mail
  // credentials — otherwise the UI hides the very flow under test.
  mail:
    devSignInCodes ||
    Boolean(config.mail.clientId && config.mail.refreshToken && config.mail.address),
  github: Boolean(config.oauth.github.clientId && config.oauth.github.clientSecret),
  google: Boolean(config.oauth.google.clientId && config.oauth.google.clientSecret),
  cloudinary: Boolean(
    config.cloudinary.cloudName && config.cloudinary.apiKey && config.cloudinary.apiSecret,
  ),
} as const;
