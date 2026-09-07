import { describe, expect, it } from "vitest";
import { MAX_POINTS, pointsBounds, simplify, toPathData } from "./stroke";

describe("pointsBounds", () => {
  it("is null with nothing to bound", () => {
    expect(pointsBounds([])).toBeNull();
  });

  it("spans every point", () => {
    expect(pointsBounds([10, 5, 0, 30, 20, 15])).toEqual({
      minX: 0,
      minY: 5,
      maxX: 20,
      maxY: 30,
    });
  });
});

describe("toPathData", () => {
  it("is empty with nothing to draw", () => {
    expect(toPathData([])).toBe("");
  });

  // A tap should leave a dot: a zero-length subpath renders as one under
  // stroke-linecap: round.
  it("renders a single sample as a zero-length subpath", () => {
    expect(toPathData([4, 7])).toBe("M 4 7 L 4 7");
  });

  it("renders two samples as a straight line", () => {
    expect(toPathData([0, 0, 10, 10])).toBe("M 0 0 L 10 10");
  });

  // Each sample is the CONTROL point; the curve passes through the midpoints.
  it("smooths through midpoints with each sample as a control point", () => {
    expect(toPathData([0, 0, 10, 0, 20, 0])).toBe("M 0 0 Q 10 0 15 0 L 20 0");
  });

  it("starts at the first sample and ends at the last", () => {
    const d = toPathData([1, 2, 30, 40, 50, 60, 70, 80]);
    expect(d.startsWith("M 1 2")).toBe(true);
    expect(d.endsWith("L 70 80")).toBe(true);
  });

  // A peer receiving half a stroke must draw exactly the same curve for that
  // half, so this has to be a pure function of the points with no windowing.
  it("is a prefix-stable function of the points", () => {
    const all = [0, 0, 10, 5, 20, 0, 30, 5, 40, 0];
    const half = all.slice(0, 6);
    expect(toPathData(all).startsWith(toPathData(half).split(" L ")[0])).toBe(true);
  });
});

describe("simplify", () => {
  it("passes through anything too short to simplify", () => {
    expect(simplify([1, 2])).toEqual([1, 2]);
    expect(simplify([1, 2, 3, 4])).toEqual([1, 2, 3, 4]);
  });

  it("drops the middle of a straight run", () => {
    expect(simplify([0, 0, 5, 0, 10, 0, 15, 0, 20, 0])).toEqual([0, 0, 20, 0]);
  });

  it("keeps a point that actually carries the shape", () => {
    expect(simplify([0, 0, 10, 40, 20, 0])).toEqual([0, 0, 10, 40, 20, 0]);
  });

  it("always keeps the first and last point", () => {
    const out = simplify([0, 0, 1, 0, 2, 0, 3, 0]);
    expect(out.slice(0, 2)).toEqual([0, 0]);
    expect(out.slice(-2)).toEqual([3, 0]);
  });

  it("respects a wider tolerance", () => {
    expect(simplify([0, 0, 10, 3, 20, 0], 5)).toEqual([0, 0, 20, 0]);
    expect(simplify([0, 0, 10, 3, 20, 0], 1)).toEqual([0, 0, 10, 3, 20, 0]);
  });

  // Recursion would risk a frame per point on a pathological stroke; this uses
  // an explicit stack, so a long one must not blow up.
  it("handles a stroke at the point cap without overflowing", () => {
    const zigzag: number[] = [];
    for (let i = 0; i < MAX_POINTS; i++) zigzag.push(i, i % 2 === 0 ? 0 : 40);
    const out = simplify(zigzag);
    expect(out.length).toBeGreaterThan(0);
    expect(out.length).toBeLessThanOrEqual(zigzag.length);
  });

  it("never returns an odd number of coordinates", () => {
    const noisy: number[] = [];
    for (let i = 0; i < 200; i++) noisy.push(i, Math.round(Math.sin(i) * 10));
    expect(simplify(noisy).length % 2).toBe(0);
  });
});
