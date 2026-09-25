import { describe, expect, it } from "vitest";
import { continuesBurst, NUDGE_BURST_MS, nudgeFor } from "./nudge";

describe("nudgeFor", () => {
  it("moves a board unit per press, in the arrow's direction", () => {
    expect(nudgeFor("ArrowLeft", false)).toEqual({ x: -1, y: 0 });
    expect(nudgeFor("ArrowRight", false)).toEqual({ x: 1, y: 0 });
    expect(nudgeFor("ArrowUp", false)).toEqual({ x: 0, y: -1 });
    expect(nudgeFor("ArrowDown", false)).toEqual({ x: 0, y: 1 });
  });

  it("moves ten with Shift", () => {
    expect(nudgeFor("ArrowLeft", true)).toEqual({ x: -10, y: 0 });
    expect(nudgeFor("ArrowDown", true)).toEqual({ x: 0, y: 10 });
  });

  it("is null for any other key", () => {
    expect(nudgeFor("a", false)).toBeNull();
    expect(nudgeFor("Enter", true)).toBeNull();
  });
});

describe("continuesBurst", () => {
  const ids = ["a", "b"];

  it("carries on a run of presses on the same selection", () => {
    expect(continuesBurst({ at: 0, ids }, { at: 200, ids })).toBe(true);
  });

  it("needs a press before it", () => {
    expect(continuesBurst(null, { at: 200, ids })).toBe(false);
  });

  it("ends after a pause", () => {
    expect(continuesBurst({ at: 0, ids }, { at: NUDGE_BURST_MS + 1, ids })).toBe(false);
  });

  // The selection is replaced, never edited in place, so a new array is a new
  // selection even when it holds the same ids.
  it("ends when the selection changes", () => {
    expect(continuesBurst({ at: 0, ids }, { at: 200, ids: [...ids] })).toBe(false);
  });
});
