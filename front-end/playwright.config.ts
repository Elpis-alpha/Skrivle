import { readFileSync } from "node:fs";
import { defineConfig, devices } from "@playwright/test";

// End-to-end runs against a real back-end, so the suite covers the actual wire
// contract — real sign-in, real board creation, real cursor sync.
//
// Deliberately NOT port 4000: with reuseExistingServer, a back-end already
// running for development would be silently reused, the env block below
// ignored, and the tests would run against the development database.
const API_PORT = 4100;
const API_URL = `http://localhost:${API_PORT}`;
const WEB_URL = "http://localhost:3000";

/**
 * The test database, derived the way back-end/src/test/setup.ts and its
 * `db:test:setup` script derive it: the development connection with the name
 * swapped. Hardcoding credentials here would break every machine whose
 * Postgres isn't set up like the author's (this one uses peer auth over a Unix
 * socket, not postgres:postgres over TCP).
 *
 * Run `npm run db:test:setup` in back-end/ once before the first e2e run.
 */
function testDatabaseUrl(): string {
  if (process.env.E2E_DATABASE_URL) return process.env.E2E_DATABASE_URL;
  try {
    const dev = readFileSync("../back-end/.env", "utf8").match(
      /^DATABASE_URL=(.*)$/m,
    )?.[1];
    if (dev) return dev.trim().replace("/skrivle?", "/skrivle_test?");
  } catch {
    // No .env — fall through to the conventional default.
  }
  return "postgresql://postgres:postgres@localhost:5432/skrivle_test?schema=public";
}

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: "html",
  use: {
    baseURL: WEB_URL,
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      command: "npm run dev",
      cwd: "../back-end",
      // /healthz stays 503 until Postgres AND Redis both answer, so this is a
      // real readiness gate rather than "the port is open".
      url: `${API_URL}/healthz`,
      reuseExistingServer: false,
      timeout: 120_000,
      stdout: "pipe",
      env: {
        NODE_ENV: "development",
        PORT: String(API_PORT),
        DATABASE_URL: testDatabaseUrl(),
        // A separate logical database keeps e2e out of the development
        // rate-limit buckets. Reset with: redis-cli -n 1 flushdb
        REDIS_URL: process.env.E2E_REDIS_URL ?? "redis://localhost:6379/1",
        CORS_ORIGIN: WEB_URL,
        FRONTEND_URL: WEB_URL,
        API_PUBLIC_URL: API_URL,
        // Pinned so a restart doesn't invalidate sessions and creator tokens
        // mid-run: this secret is the pepper for both.
        SESSION_SECRET: "e2e-secret-not-used-outside-tests",
        // Hands sign-in codes back in the response so tests can sign in
        // without an inbox. Ignored in production.
        AUTH_DEV_CODES: "1",
      },
    },
    {
      command: "npm run dev",
      url: WEB_URL,
      // Must start cold: NEXT_PUBLIC_API_URL is inlined at build/compile time,
      // so a server already running for development would still point at 4000.
      reuseExistingServer: false,
      timeout: 120_000,
      env: { NEXT_PUBLIC_API_URL: API_URL },
    },
  ],
});
