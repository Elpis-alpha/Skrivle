import { beforeEach, describe, expect, it } from "vitest";
import { CODE_LENGTH, MAX_ATTEMPTS, inCooldown, issueCode, normalizeEmail, verifyCode } from "./otp.js";
import { flushTestKeys, useRedis } from "../test/redis-harness.js";

useRedis();

const EMAIL = "otp-test@example.com";

beforeEach(async () => {
  await flushTestKeys("otp:*", "otpcool:*");
});

describe("normalizeEmail", () => {
  it("lowercases and trims, so casing cannot fork one person into two accounts", () => {
    expect(normalizeEmail("  Person@Example.COM ")).toBe("person@example.com");
  });
});

describe("issueCode", () => {
  it("returns a code of the length the UI expects", async () => {
    expect(await issueCode(EMAIL)).toMatch(new RegExp(`^\\d{${CODE_LENGTH}}$`));
  });

  it("treats addresses case-insensitively", async () => {
    const code = await issueCode("Mixed@Example.com");
    expect(await verifyCode("mixed@example.com", code)).toEqual({ ok: true });
  });

  it("starts a resend cooldown", async () => {
    expect(await inCooldown(EMAIL)).toBe(false);
    await issueCode(EMAIL);
    expect(await inCooldown(EMAIL)).toBe(true);
  });

  it("replaces the previous code rather than accepting both", async () => {
    const first = await issueCode(EMAIL);
    const second = await issueCode(EMAIL);
    expect(await verifyCode(EMAIL, first)).toEqual({ ok: false, reason: "mismatch" });
    expect(await verifyCode(EMAIL, second)).toEqual({ ok: true });
  });
});

describe("verifyCode", () => {
  it("accepts the issued code", async () => {
    const code = await issueCode(EMAIL);
    expect(await verifyCode(EMAIL, code)).toEqual({ ok: true });
  });

  it("consumes the code, so it cannot be replayed", async () => {
    const code = await issueCode(EMAIL);
    expect(await verifyCode(EMAIL, code)).toEqual({ ok: true });
    expect(await verifyCode(EMAIL, code)).toEqual({ ok: false, reason: "expired" });
  });

  it("reports a missing code as expired", async () => {
    expect(await verifyCode("nobody@example.com", "000000")).toEqual({
      ok: false,
      reason: "expired",
    });
  });

  it("rejects a wrong code", async () => {
    const code = await issueCode(EMAIL);
    const wrong = code === "000000" ? "111111" : "000000";
    expect(await verifyCode(EMAIL, wrong)).toEqual({ ok: false, reason: "mismatch" });
  });

  it("burns the code after MAX_ATTEMPTS wrong guesses", async () => {
    const code = await issueCode(EMAIL);
    const wrong = code === "000000" ? "111111" : "000000";

    for (let i = 1; i < MAX_ATTEMPTS; i++) {
      expect(await verifyCode(EMAIL, wrong), `attempt ${i}`).toEqual({
        ok: false,
        reason: "mismatch",
      });
    }
    // The final permitted attempt burns it rather than leaving one more guess.
    expect(await verifyCode(EMAIL, wrong)).toEqual({ ok: false, reason: "exhausted" });

    // Even the correct code is dead now — this is the property that makes a
    // six-digit space safe.
    expect(await verifyCode(EMAIL, code)).toEqual({ ok: false, reason: "expired" });
  });

  it("counts attempts per address, not globally", async () => {
    const a = await issueCode("a@example.com");
    await issueCode("b@example.com");

    for (let i = 0; i < MAX_ATTEMPTS; i++) await verifyCode("b@example.com", "999999");

    // b is burned; a must be untouched.
    expect(await verifyCode("a@example.com", a)).toEqual({ ok: true });
  });
});
