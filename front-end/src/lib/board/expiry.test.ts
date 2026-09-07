import { describe, expect, it } from "vitest";
import { formatRemaining } from "./expiry";

const NOW = Date.parse("2026-09-07T12:00:00.000Z");
const at = (ms: number) => new Date(NOW + ms).toISOString();

describe("formatRemaining", () => {
  it("reports whole hours", () => {
    expect(formatRemaining(at(48 * 3600_000), NOW)).toBe("Expires in 48h");
    expect(formatRemaining(at(23 * 3600_000), NOW)).toBe("Expires in 23h");
  });

  it("rounds down rather than promising time that isn't there", () => {
    expect(formatRemaining(at(23 * 3600_000 + 59 * 60_000), NOW)).toBe("Expires in 23h");
  });

  it("switches to minutes under an hour", () => {
    expect(formatRemaining(at(59 * 60_000), NOW)).toBe("Expires in 59m");
    expect(formatRemaining(at(60_000), NOW)).toBe("Expires in 1m");
  });

  it("says under a minute rather than counting seconds", () => {
    expect(formatRemaining(at(59_000), NOW)).toBe("Expires in under a minute");
  });

  it("reports a board already past its time", () => {
    expect(formatRemaining(at(-1), NOW)).toBe("Expired");
    expect(formatRemaining(at(-3600_000), NOW)).toBe("Expired");
  });

  it("degrades gracefully on an unparseable date", () => {
    expect(formatRemaining("not a date", NOW)).toBe("Expires soon");
  });
});
