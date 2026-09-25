import { afterEach, describe, expect, it, vi } from "vitest";

// Both the scale and the rules built from it are computed once at module load,
// so each case needs a fresh import with a different environment.
async function loadWith<T>(env: Record<string, string>, load: () => Promise<T>): Promise<T> {
  vi.resetModules();
  const saved = { ...process.env };
  Object.assign(process.env, env);
  try {
    return await load();
  } finally {
    for (const key of Object.keys(process.env)) delete process.env[key];
    Object.assign(process.env, saved);
  }
}

const env = (vars: Record<string, string>) => loadWith(vars, () => import("./env.js"));

const PROD_REQUIRED = {
  DATABASE_URL: "postgresql://user:pass@localhost:5432/skrivle",
  SESSION_SECRET: "a-real-secret-for-this-test",
};

afterEach(() => vi.resetModules());

describe("RATE_LIMIT_SCALE", () => {
  it("is 1 unless set", async () => {
    const { rateLimitScale } = await env({ NODE_ENV: "development" });
    expect(rateLimitScale).toBe(1);
  });

  it("takes a whole number in development", async () => {
    const { rateLimitScale } = await env({ NODE_ENV: "development", RATE_LIMIT_SCALE: "10" });
    expect(rateLimitScale).toBe(10);
  });

  it("is 1 for anything that isn't a whole number above zero", async () => {
    for (const value of ["0", "-2", "2.5", "lots", ""]) {
      const { rateLimitScale } = await env({ NODE_ENV: "development", RATE_LIMIT_SCALE: value });
      expect(rateLimitScale, value).toBe(1);
    }
  });

  // The property that matters: a production deployment cannot be talked into
  // loosening its limits, however the variable is set.
  it("stays 1 in production even when set", async () => {
    const { rateLimitScale } = await env({
      ...PROD_REQUIRED,
      NODE_ENV: "production",
      RATE_LIMIT_SCALE: "10",
    });
    expect(rateLimitScale).toBe(1);
  });

  it("multiplies every rule's limit, and nothing else", async () => {
    const plain = await loadWith({ NODE_ENV: "development" }, () =>
      import("../redis/rate-limit.js"),
    );
    const scaled = await loadWith({ NODE_ENV: "development", RATE_LIMIT_SCALE: "10" }, () =>
      import("../redis/rate-limit.js"),
    );

    for (const [name, rule] of Object.entries(plain.RULES)) {
      const other = scaled.RULES[name as keyof typeof plain.RULES];
      expect(other.limit, name).toBe(rule.limit * 10);
      expect(other.windowSeconds, name).toBe(rule.windowSeconds);
    }
  });
});
