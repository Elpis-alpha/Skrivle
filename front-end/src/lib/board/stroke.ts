// Freehand strokes: raw pointer samples in, SVG path data out.
//
// The ink is drawn as a filled outline rather than a stroked centre line, so it
// can thin and swell the way a pen does. perfect-freehand builds that outline;
// it is small, dependency-free and — the property that matters here — a pure
// function of its input, so every peer holding the same samples draws exactly
// the same ink. §10.6's 1/2/4/8 still picks the stroke's weight; the ends taper
// to a point the way ink leaves a nib.
//
// The weight is constant between the tapers — pressure is neither stored nor
// simulated. Simulating it from pointer speed was tried and rejected: speed is
// just the spacing between samples, which makes the ink depend on the device's
// sample rate, and the simplify() pass that runs when a stroke ends changes the
// spacing — a finished stroke visibly lost half its weight the moment the pen
// lifted. Tapers are measured along the stroke's length, which neither
// affects. The samples stay [x, y] pairs, so every existing snapshot keeps its
// wire format and an old board's strokes simply redraw with the new ink.
//
// Points are a flat [x, y, x, y, …] array of integers, stored relative to the
// element's origin. Flat because it is one Y.Array whose appends merge into a
// single Yjs item; integers because lib0 encodes an int in ~3 bytes and a float
// in 9; relative so that moving a 600-point stroke is two field writes rather
// than a rewrite of all 1,200 numbers.

import { getStroke } from "perfect-freehand";

/** Beyond this a stroke is a mistake, not a drawing. Guards MAX_UPDATE_BYTES. */
export const MAX_POINTS = 5000;

/** How far a point may sit from the simplified line before it is kept, in board units. */
export const SIMPLIFY_TOLERANCE = 0.6;

export type Bounds = { minX: number; minY: number; maxX: number; maxY: number };

export function pointsBounds(points: readonly number[]): Bounds | null {
  if (points.length < 2) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (let i = 0; i + 1 < points.length; i += 2) {
    minX = Math.min(minX, points[i]);
    maxX = Math.max(maxX, points[i]);
    minY = Math.min(minY, points[i + 1]);
    maxY = Math.max(maxY, points[i + 1]);
  }
  return { minX, minY, maxX, maxY };
}

const round = (n: number) => Math.round(n * 100) / 100;

/**
 * The outline of a stroke's ink, as path data to fill.
 *
 * `width` is the §10.6 weight, which the ink holds between its tapered ends.
 */
export function strokeOutline(points: readonly number[], width: number): string {
  const count = Math.floor(points.length / 2);
  if (count === 0) return "";

  const pairs: [number, number][] = [];
  for (let i = 0; i < count; i++) pairs.push([points[i * 2], points[i * 2 + 1]]);

  const size = width + INK_FLOOR;
  const taper = { taper: size * TAPER_PER_SIZE, cap: true };
  const outline = getStroke(pairs, {
    size,
    smoothing: 0.5,
    streamline: 0.4,
    simulatePressure: false,
    start: taper,
    end: taper,
    // Treated as finished. A stroke still being drawn gets the same round end,
    // which is what the pen tip looks like under the pointer anyway — and it
    // keeps this a function of the samples alone, with no "done" flag to sync.
    last: true,
  });
  if (outline.length === 0) return "";

  // Each outline point becomes a quadratic control point with the curve
  // passing through the midpoints between them — the same smoothing toPathData
  // uses, closed back to the start.
  const parts = [`M ${round(outline[0][0])} ${round(outline[0][1])} Q`];
  for (let i = 0; i < outline.length; i++) {
    const [x0, y0] = outline[i];
    const [x1, y1] = outline[(i + 1) % outline.length];
    parts.push(`${round(x0)} ${round(y0)} ${round((x0 + x1) / 2)} ${round((y0 + y1) / 2)}`);
  }
  parts.push("Z");
  return parts.join(" ");
}

/**
 * Added to the §10.6 weight: tapered ends pull a stroke's average weight a
 * little under its width, and this brings it back, while keeping a 1px stroke's
 * tapers from thinning to nothing.
 */
const INK_FLOOR = 0.5;

/** How long each tapered end is, in multiples of the ink's width. */
const TAPER_PER_SIZE = 6;

/**
 * Ramer–Douglas–Peucker, run once on pointerup.
 *
 * Drawing appends every sample so the stroke stays live for peers; this is the
 * one rewrite that drops the samples which were never carrying any shape. It
 * uses an explicit stack rather than recursion — the worst case for RDP is a
 * frame per point, and strokes here can run to thousands.
 */
export function simplify(points: readonly number[], tolerance = SIMPLIFY_TOLERANCE): number[] {
  const count = Math.floor(points.length / 2);
  if (count < 3) return points.slice(0, count * 2);

  const keep = new Uint8Array(count);
  keep[0] = 1;
  keep[count - 1] = 1;

  const toleranceSquared = tolerance * tolerance;
  const stack: Array<[number, number]> = [[0, count - 1]];

  while (stack.length > 0) {
    const [first, last] = stack.pop()!;
    if (last <= first + 1) continue;

    let worst = 0;
    let worstIndex = -1;
    for (let i = first + 1; i < last; i++) {
      const d = perpendicularSquared(points, i, first, last);
      if (d > worst) {
        worst = d;
        worstIndex = i;
      }
    }

    if (worst > toleranceSquared && worstIndex > 0) {
      keep[worstIndex] = 1;
      stack.push([first, worstIndex], [worstIndex, last]);
    }
  }

  const out: number[] = [];
  for (let i = 0; i < count; i++) {
    if (keep[i]) out.push(points[i * 2], points[i * 2 + 1]);
  }
  return out;
}

/** Squared distance from point `i` to the segment `first`–`last`. */
function perpendicularSquared(
  points: readonly number[],
  i: number,
  first: number,
  last: number,
): number {
  const ax = points[first * 2];
  const ay = points[first * 2 + 1];
  const bx = points[last * 2];
  const by = points[last * 2 + 1];
  const px = points[i * 2];
  const py = points[i * 2 + 1];

  const dx = bx - ax;
  const dy = by - ay;
  const lengthSquared = dx * dx + dy * dy;

  if (lengthSquared === 0) return (px - ax) ** 2 + (py - ay) ** 2;

  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lengthSquared));
  return (px - (ax + t * dx)) ** 2 + (py - (ay + t * dy)) ** 2;
}
