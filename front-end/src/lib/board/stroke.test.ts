import { describe, expect, it } from "vitest";
import { MAX_POINTS, pointsBounds, simplify, strokeOutline } from "./stroke";

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

describe("strokeOutline", () => {
  const zigzag = [0, 0, 20, 10, 40, 0, 60, 12, 80, 0];

  it("draws nothing for no samples", () => {
    expect(strokeOutline([], 2)).toBe("");
  });

  it("fills a closed shape — the ink's outline, not a line through its middle", () => {
    const d = strokeOutline(zigzag, 2);
    expect(d.startsWith("M")).toBe(true);
    expect(d.endsWith("Z")).toBe(true);
  });

  it("leaves a dot for a single tap", () => {
    expect(strokeOutline([5, 5], 4)).toMatch(/^M .+ Z$/);
  });

  // A peer holding the same samples must draw exactly the ink we do.
  it("is a pure function of the samples", () => {
    expect(strokeOutline(zigzag, 4)).toBe(strokeOutline([...zigzag], 4));
  });

  it("is wider for a wider stroke", () => {
    const spanY = (d: string) => {
      const ys = [...d.matchAll(/(-?[\d.]+) (-?[\d.]+)/g)].map((m) => Number(m[2]));
      return Math.max(...ys) - Math.min(...ys);
    };
    const flat = [0, 0, 40, 0, 80, 0];
    expect(spanY(strokeOutline(flat, 8))).toBeGreaterThan(spanY(strokeOutline(flat, 1)));
  });

  // Weight as ink area over centre-line length, from the outline's polygon.
  const weight = (points: number[], width: number) => {
    const xy = [...strokeOutline(points, width).matchAll(/(-?[\d.]+) (-?[\d.]+)/g)].map((m) => [
      Number(m[1]),
      Number(m[2]),
    ]);
    let area = 0;
    for (let i = 0; i < xy.length; i++) {
      const [x0, y0] = xy[i];
      const [x1, y1] = xy[(i + 1) % xy.length];
      area += x0 * y1 - x1 * y0;
    }
    let length = 0;
    for (let i = 2; i < points.length; i += 2) {
      length += Math.hypot(points[i] - points[i - 2], points[i + 1] - points[i - 1]);
    }
    return Math.abs(area / 2) / length;
  };

  // A hand-drawn wave sampled densely, like a 120Hz pointer.
  const wave: number[] = [];
  for (let i = 0; i < 240; i++) {
    const t = i / 239;
    wave.push(Math.round(t * 600), Math.round(Math.sin(t * 5) * 80));
  }

  // Simplification runs when a stroke ends; the ink must not visibly thin or
  // swell at that moment, for us or for anyone watching.
  it("keeps its weight when the finished stroke is simplified", () => {
    const before = weight(wave, 4);
    const after = weight(simplify(wave), 4);
    expect(Math.abs(after / before - 1)).toBeLessThan(0.08);
  });

  // A 240Hz stylus and a 60Hz mouse drawing the same line should leave the
  // same ink.
  it("weighs the same however densely the pointer was sampled", () => {
    const sparse = wave.filter((_, i) => Math.floor(i / 2) % 4 === 0);
    expect(Math.abs(weight(sparse, 4) / weight(wave, 4) - 1)).toBeLessThan(0.08);
  });

  it("averages close to the weight the picker shows", () => {
    for (const width of [1, 2, 4, 8]) {
      expect(Math.abs(weight(wave, width) - width)).toBeLessThan(0.75);
    }
  });
});
