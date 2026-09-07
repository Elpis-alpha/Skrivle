// Runs before every test file.
//
// Tests must never touch the development database — several suites truncate
// tables. The URL is rewritten here, before any module reads it, because
// config/env.ts snapshots the environment at import time.
//
// Node's process.loadEnvFile() (called in config/env.ts) does not overwrite
// variables that are already set, so what is assigned here wins over .env.
import { readFileSync } from "node:fs";

const TEST_DB = "skrivle_test";

function testDatabaseUrl(): string {
  // An explicit override wins, for CI or a differently-provisioned machine.
  const explicit = process.env.TEST_DATABASE_URL;
  if (explicit) return explicit;

  // Otherwise reuse the development connection with the database name swapped,
  // so credentials and host settings do not have to be duplicated.
  const dev = process.env.DATABASE_URL ?? readDevUrlFromEnvFile();
  if (dev) {
    try {
      const url = new URL(dev);
      url.pathname = `/${TEST_DB}`;
      return url.toString();
    } catch {
      /* fall through to the default below */
    }
  }
  return `postgresql://postgres:postgres@localhost:5432/${TEST_DB}?schema=public`;
}

/** DATABASE_URL usually lives only in .env, which has not been loaded yet here. */
function readDevUrlFromEnvFile(): string | undefined {
  try {
    const match = readFileSync(".env", "utf8").match(/^DATABASE_URL=(.*)$/m);
    return match?.[1]?.trim();
  } catch {
    return undefined;
  }
}

const resolved = testDatabaseUrl();
if (!resolved.includes(TEST_DB)) {
  throw new Error(
    `Refusing to run tests against "${resolved}" — the database name must contain "${TEST_DB}".`,
  );
}
process.env.DATABASE_URL = resolved;

// A fixed pepper, so hashes are comparable across runs.
process.env.SESSION_SECRET ??= "test-secret-not-used-outside-tests";
