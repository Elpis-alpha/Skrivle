// Freehand strokes: raw pointer samples in, an SVG path out.
//
// No dependency for this. §10.6 fixes stroke width at 1/2/4/8 and §8 asks for
// round caps and joins, so there is no variable-width or pressure-tapered
// rendering to buy in — a smoothed constant-width polyline is the whole
// requirement.
//
// Points are a flat [x, y, x, y, …] array of integers, stored relative to the
// element's origin. Flat because it is one Y.Array whose appends merge into a
// single Yjs item; integers because lib0 encodes an int in ~3 bytes and a float
// in 9; relative so that moving a 600-point stroke is two field writes rather
// than a rewrite of all 1,200 numbers.

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

/**
 * Smooth the samples into an SVG path.
 *
 * Each sample becomes the *control* point of a quadratic, and the curve passes
 * through the midpoints between samples. That rounds off pointer jitter without
 * any windowing or averaging, and it stays a pure function of the points — so a
 * peer receiving half a stroke draws exactly the same curve we do for that half.
 */
export function toPathData(points: readonly number[]): string {
  if (points.length < 2) return "";

  const x = (i: number) => points[i * 2];
  const y = (i: number) => points[i * 2 + 1];
  const count = Math.floor(points.length / 2);

  // A single sample is a dot. A zero-length subpath renders as one under
  // stroke-linecap: round, which is what a tap on the canvas should leave.
  if (count === 1) return `M ${x(0)} ${y(0)} L ${x(0)} ${y(0)}`;
  if (count === 2) return `M ${x(0)} ${y(0)} L ${x(1)} ${y(1)}`;

  const parts = [`M ${x(0)} ${y(0)}`];
  for (let i = 1; i < count - 1; i++) {
    const midX = round((x(i) + x(i + 1)) / 2);
    const midY = round((y(i) + y(i + 1)) / 2);
    parts.push(`Q ${x(i)} ${y(i)} ${midX} ${midY}`);
  }
  parts.push(`L ${x(count - 1)} ${y(count - 1)}`);
  return parts.join(" ");
}

const round = (n: number) => Math.round(n * 100) / 100;

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
