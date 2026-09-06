// Typed view of the process environment. See back-end/.env.example.

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

export const config = {
  nodeEnv,
  isProduction,
  port: Number(process.env.PORT ?? 4000),
  databaseUrl: required("DATABASE_URL"),
  corsOrigin: process.env.CORS_ORIGIN ?? "http://localhost:3000",
  sessionSecret: required("SESSION_SECRET"),
  oauth: {
    github: {
      clientId: process.env.GITHUB_CLIENT_ID ?? "",
      clientSecret: process.env.GITHUB_CLIENT_SECRET ?? "",
    },
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID ?? "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
    },
  },
  email: {
    /** From-address for one-time-code messages. */
    from: process.env.EMAIL_FROM ?? "",
    /** SMTP connection string for the code sender (Phase 1 — provider TBD). */
    smtpUrl: process.env.SMTP_URL ?? "",
  },
} as const;
