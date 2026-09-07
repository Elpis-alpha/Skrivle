import { describe, expect, it } from "vitest";
import { config } from "../config/env.js";
import { connectRedis, redis } from "./client.js";
import { keys, TTL } from "./keys.js";

describe("redis config", () => {
  it("resolves a connection URL", () => {
    // Either REDIS_URL from the environment, or the localhost default. The
    // earlier version of this test asserted REDIS_URL was *unset*, which broke
    // as soon as config/env.ts started loading .env.
    expect(config.redisUrl).toMatch(/^rediss?:\/\/.+/);
  });
});

describe("redis client", () => {
  it("exports a client and a connect helper", () => {
    expect(typeof redis.ping).toBe("function");
    expect(typeof connectRedis).toBe("function");
  });

  it("does not open a connection on import", () => {
    expect(redis.isOpen).toBe(false);
  });
});

describe("keyspace", () => {
  it("namespaces every key by kind", () => {
    expect(keys.session("abc")).toMatch(/^sess:/);
    expect(keys.userSessions("u1")).toBe("usess:u1");
    expect(keys.otp("a@b.com")).toMatch(/^otp:/);
    expect(keys.otpCooldown("a@b.com")).toMatch(/^otpcool:/);
    expect(keys.oauthState("st")).toBe("oauth:st");
    expect(keys.rateLimit("bucket", "subject")).toBe("rl:bucket:subject");
  });

  it("never puts a session id or an email into a key in the clear", () => {
    // A `redis KEYS *` on a compromised box must not yield a replayable
    // session token or a list of user addresses.
    expect(keys.session("secret-session-id")).not.toContain("secret-session-id");
    expect(keys.otp("person@example.com")).not.toContain("person@example.com");
  });

  it("derives keys deterministically", () => {
    expect(keys.session("same")).toBe(keys.session("same"));
    expect(keys.session("a")).not.toBe(keys.session("b"));
  });

  it("gives every TTL a positive duration", () => {
    for (const [name, seconds] of Object.entries(TTL)) {
      expect(seconds, name).toBeGreaterThan(0);
    }
  });
});
