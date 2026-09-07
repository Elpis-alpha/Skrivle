import { afterEach, describe, expect, it, vi } from "vitest";

// devSignInCodes is computed once at module load, so each case needs a fresh
// import with a different environment.
async function loadWith(env: Record<string, string>) {
  vi.resetModules();
  const saved = { ...process.env };
  Object.assign(process.env, env);
  try {
    return await import("./env.js");
  } finally {
    for (const key of Object.keys(process.env)) delete process.env[key];
    Object.assign(process.env, saved);
  }
}

const PROD_REQUIRED = {
  DATABASE_URL: "postgresql://user:pass@localhost:5432/skrivle",
  SESSION_SECRET: "a-real-secret-for-this-test",
};

afterEach(() => vi.resetModules());

describe("AUTH_DEV_CODES", () => {
  it("is off unless explicitly set to 1", async () => {
    const { devSignInCodes } = await loadWith({ NODE_ENV: "development" });
    expect(devSignInCodes).toBe(false);
  });

  it("ignores any value other than 1", async () => {
    const { devSignInCodes } = await loadWith({
      NODE_ENV: "development",
      AUTH_DEV_CODES: "true",
    });
    expect(devSignInCodes).toBe(false);
  });

  it("turns on in development when set to 1", async () => {
    const { devSignInCodes } = await loadWith({
      NODE_ENV: "development",
      AUTH_DEV_CODES: "1",
    });
    expect(devSignInCodes).toBe(true);
  });

  // The property that matters: a production deployment cannot be talked into
  // handing out sign-in codes, however the variable is set.
  it("stays off in production even when set to 1", async () => {
    const { devSignInCodes } = await loadWith({
      ...PROD_REQUIRED,
      NODE_ENV: "production",
      AUTH_DEV_CODES: "1",
    });
    expect(devSignInCodes).toBe(false);
  });

  it("advertises the email sign-in method while on, so the UI still offers it", async () => {
    const { featureEnabled } = await loadWith({
      NODE_ENV: "development",
      AUTH_DEV_CODES: "1",
      MAIL_CLIENT_ID: "",
      MAIL_REFRESH_TOKEN: "",
      MAIL_ADDRESS: "",
    });
    expect(featureEnabled.mail).toBe(true);
  });
});
