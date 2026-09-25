import { describe, expect, it } from "vitest";
import { formatEdited } from "./edited";

// Midday, so no timezone moves any of these onto another calendar day.
const NOW = new Date("2026-09-25T12:00:00").getTime();
const ago = (ms: number) => new Date(NOW - ms).toISOString();

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

describe("formatEdited", () => {
  it("says just now inside a minute", () => {
    expect(formatEdited(ago(20_000), NOW)).toBe("edited just now");
  });

  // A server clock a little ahead of this one is still "just now".
  it("says just now for a time slightly ahead of the clock", () => {
    expect(formatEdited(ago(-5_000), NOW)).toBe("edited just now");
  });

  it("counts minutes, then hours, then days", () => {
    expect(formatEdited(ago(5 * MINUTE), NOW)).toBe("edited 5m ago");
    expect(formatEdited(ago(2 * HOUR + 10 * MINUTE), NOW)).toBe("edited 2h ago");
    expect(formatEdited(ago(3 * DAY), NOW)).toBe("edited 3d ago");
  });

  it("gives the date after a week", () => {
    expect(formatEdited(ago(20 * DAY), NOW)).toBe("edited 5 Sept");
  });

  it("adds the year when it isn't this one", () => {
    expect(formatEdited("2025-03-12T12:00:00", NOW)).toBe("edited 12 Mar 2025");
  });

  it("says nothing it can't back up for a date it can't read", () => {
    expect(formatEdited("not a date", NOW)).toBe("");
  });
});
