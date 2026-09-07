import { describe, expect, it } from "vitest";
import {
  generateNumericCode,
  hashToken,
  randomToken,
  safeEqual,
  verifyToken,
} from "./hash.js";

describe("hashToken", () => {
  it("is deterministic", () => {
    expect(hashToken("value")).toBe(hashToken("value"));
  });

  it("separates distinct inputs", () => {
    expect(hashToken("a")).not.toBe(hashToken("b"));
  });

  it("produces a hex sha256 digest", () => {
    expect(hashToken("value")).toMatch(/^[0-9a-f]{64}$/);
  });

  it("does not embed the plaintext", () => {
    expect(hashToken("person@example.com")).not.toContain("person@example.com");
  });
});

describe("randomToken", () => {
  it("is URL-safe", () => {
    for (let i = 0; i < 200; i++) {
      expect(randomToken()).toMatch(/^[A-Za-z0-9_-]+$/);
    }
  });

  it("does not repeat", () => {
    const seen = new Set(Array.from({ length: 1000 }, () => randomToken()));
    expect(seen.size).toBe(1000);
  });

  it("honours the requested byte length", () => {
    // base64url of 32 bytes is 43 chars once padding is dropped.
    expect(randomToken(32)).toHaveLength(43);
    expect(randomToken(16)).toHaveLength(22);
  });
});

describe("safeEqual", () => {
  it("matches identical strings", () => {
    expect(safeEqual("abc", "abc")).toBe(true);
  });

  it("rejects different strings of equal length", () => {
    expect(safeEqual("abc", "abd")).toBe(false);
  });

  it("rejects different lengths without throwing", () => {
    // timingSafeEqual throws on a length mismatch; safeEqual must not.
    expect(() => safeEqual("short", "much longer string")).not.toThrow();
    expect(safeEqual("short", "much longer string")).toBe(false);
  });

  it("handles the empty string", () => {
    expect(safeEqual("", "")).toBe(true);
    expect(safeEqual("", "x")).toBe(false);
  });
});

describe("verifyToken", () => {
  it("accepts the token that produced the digest", () => {
    const token = randomToken();
    expect(verifyToken(token, hashToken(token))).toBe(true);
  });

  it("rejects any other token", () => {
    expect(verifyToken(randomToken(), hashToken(randomToken()))).toBe(false);
  });
});

describe("generateNumericCode", () => {
  it("returns exactly six digits by default", () => {
    for (let i = 0; i < 500; i++) {
      expect(generateNumericCode()).toMatch(/^\d{6}$/);
    }
  });

  it("keeps leading zeros rather than shortening the code", () => {
    // The UI's segmented input expects a fixed width, so "000123" must not
    // arrive as "123".
    const codes = Array.from({ length: 20_000 }, () => generateNumericCode());
    expect(codes.every((c) => c.length === 6)).toBe(true);
    expect(codes.some((c) => c.startsWith("0"))).toBe(true);
  });

  it("honours a custom length", () => {
    expect(generateNumericCode(4)).toMatch(/^\d{4}$/);
    expect(generateNumericCode(8)).toMatch(/^\d{8}$/);
  });

  it("distributes first digits evenly", () => {
    // Guards against a modulo-biased implementation. With 60k samples each of
    // the ten leading digits should land near 6000; allow generous slack so
    // this cannot flake.
    const counts = new Array(10).fill(0);
    for (let i = 0; i < 60_000; i++) {
      counts[Number(generateNumericCode()[0])]++;
    }
    for (const count of counts) {
      expect(count).toBeGreaterThan(5_000);
      expect(count).toBeLessThan(7_000);
    }
  });
});
