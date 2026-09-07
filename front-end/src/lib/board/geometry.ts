// Canvas geometry: bounding boxes, hit-testing, marquee, resize.
//
// Pure maths — no Yjs, no React, no DOM. Everything here works in *board*
// coordinates, never screen pixels, so it is unaffected by the camera.
//
// Hit-testing lives here rather than falling out of SVG `pointer-events`
// because §10.8 draws shapes with no fill: `visiblePainted` would only ever hit
// the 2px stroke, so clicking inside a rectangle would select nothing, while
// `pointer-events: all` would make every hollow shape swallow clicks meant for
// things behind it. It is moot mid-drag anyway — once the host takes pointer
// capture every pointermove retargets to it, so `event.target` tells you
// nothing.

import type { ElementSnapshot } from "@/lib/realtime/doc-schema";

export type Point = { x: number; y: number };
export type Rect = { x: number; y: number; w: number; h: number };

/** §10.7 — 6px square handles at the corners and edge midpoints. */
export const HANDLES = ["nw", "n", "ne", "e", "se", "s", "sw", "w"] as const;
export type Handle = (typeof HANDLES)[number];

/** Nothing may be resized smaller than this, in board units. */
export const MIN_SIZE = 8;

/**
 * A click is never harder than this to land, however far you have zoomed out.
 * A 2px stroke at 25% zoom is a half-pixel target otherwise.
 */
export const GRAB_PX = 6;

/** Two drag corners in any order to a rect with positive width and height. */
export function normalizeRect(a: Point, b: Point): Rect {
  return {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    w: Math.abs(b.x - a.x),
    h: Math.abs(b.y - a.y),
  };
}

/**
 * An element's axis-aligned bounding box.
 *
 * Three storage conventions meet here. Notes, text and shapes store a positive
 * size. Lines store `w`/`h` as a delta from their start, so those may be
 * negative. Paths store a positive size plus `bx`/`by`, the offset from their
 * anchor to the top-left of the box. This is the one place that is resolved.
 */
export function bboxOf(
  el: Pick<ElementSnapshot, "x" | "y" | "w" | "h"> &
    Partial<Pick<ElementSnapshot, "kind" | "bx" | "by">>,
): Rect {
  if (el.kind === "path") {
    return { x: el.x + (el.bx ?? 0), y: el.y + (el.by ?? 0), w: el.w, h: el.h };
  }
  return normalizeRect({ x: el.x, y: el.y }, { x: el.x + el.w, y: el.y + el.h });
}

export function unionRects(rects: readonly Rect[]): Rect | null {
  if (rects.length === 0) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const r of rects) {
    minX = Math.min(minX, r.x);
    minY = Math.min(minY, r.y);
    maxX = Math.max(maxX, r.x + r.w);
    maxY = Math.max(maxY, r.y + r.h);
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

export function inflate(rect: Rect, by: number): Rect {
  return { x: rect.x - by, y: rect.y - by, w: rect.w + by * 2, h: rect.h + by * 2 };
}

export function rectContains(rect: Rect, p: Point): boolean {
  return p.x >= rect.x && p.x <= rect.x + rect.w && p.y >= rect.y && p.y <= rect.y + rect.h;
}

/** Marquee selection: overlap is enough, an element need not be fully enclosed. */
export function rectsIntersect(a: Rect, b: Rect): boolean {
  return (
    a.x <= b.x + b.w && b.x <= a.x + a.w && a.y <= b.y + b.h && b.y <= a.y + a.h
  );
}

/** Shortest distance from a point to the segment ab. */
export function distanceToSegment(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSquared = dx * dx + dy * dy;

  // A zero-length segment is a point; the projection below would divide by zero.
  if (lengthSquared === 0) return Math.hypot(p.x - a.x, p.y - a.y);

  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lengthSquared));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/**
 * Shortest distance to a polyline held as a flat [x, y, x, y, …] array, offset
 * by `origin`.
 *
 * Points are stored relative to the element so that moving a 600-point stroke is
 * two field writes rather than a rewrite of all 1,200 numbers.
 */
export function distanceToPolyline(p: Point, points: readonly number[], origin: Point): number {
  if (points.length < 2) return Infinity;
  if (points.length === 2) {
    return Math.hypot(p.x - (origin.x + points[0]), p.y - (origin.y + points[1]));
  }

  let best = Infinity;
  for (let i = 0; i + 3 < points.length; i += 2) {
    best = Math.min(
      best,
      distanceToSegment(
        p,
        { x: origin.x + points[i], y: origin.y + points[i + 1] },
        { x: origin.x + points[i + 2], y: origin.y + points[i + 3] },
      ),
    );
  }
  return best;
}

/** Distance from a point to the outline of an axis-aligned ellipse inscribed in `rect`. */
function distanceToEllipse(p: Point, rect: Rect): number {
  const rx = rect.w / 2;
  const ry = rect.h / 2;
  if (rx <= 0 || ry <= 0) return Infinity;

  const dx = p.x - (rect.x + rx);
  const dy = p.y - (rect.y + ry);

  // Normalised radius: 1 is exactly on the outline. Scaling back by the smaller
  // semi-axis turns that into an approximate distance, which is close enough at
  // the tolerances we test against and avoids solving a quartic.
  const normalised = Math.hypot(dx / rx, dy / ry);
  return Math.abs(normalised - 1) * Math.min(rx, ry);
}

/** Distance from a point to a rectangle's outline (0 anywhere on the border). */
function distanceToRectOutline(p: Point, r: Rect): number {
  const corners: Point[] = [
    { x: r.x, y: r.y },
    { x: r.x + r.w, y: r.y },
    { x: r.x + r.w, y: r.y + r.h },
    { x: r.x, y: r.y + r.h },
  ];
  let best = Infinity;
  for (let i = 0; i < 4; i++) {
    best = Math.min(best, distanceToSegment(p, corners[i], corners[(i + 1) % 4]));
  }
  return best;
}

/**
 * How close a pointer must get to count as a hit, in board units.
 *
 * Always at least GRAB_PX on screen, so zooming out never makes a thing
 * unclickable, and never less than half the stroke so a fat stroke is grabbable
 * anywhere it is painted.
 */
export function toleranceFor(el: Pick<ElementSnapshot, "strokeWidth">, scale: number): number {
  return Math.max(GRAB_PX / scale, el.strokeWidth / 2);
}

/**
 * Does this element sit under the pointer?
 *
 * Notes and text boxes are solid — anywhere inside counts. Everything else is
 * ink, so only the painted line does, which is what makes it possible to click
 * a note *through* the middle of a rectangle drawn over it.
 */
export function hitTest(
  el: ElementSnapshot,
  point: Point,
  scale: number,
  points?: readonly number[],
): boolean {
  const tolerance = toleranceFor(el, scale);
  const box = bboxOf(el);

  // Cheap rejection first: everything below is inside the inflated box.
  if (!rectContains(inflate(box, tolerance), point)) return false;

  switch (el.kind) {
    case "note":
    case "text":
      return true;
    case "rect":
      return el.fill !== null || distanceToRectOutline(point, box) <= tolerance;
    case "ellipse": {
      if (distanceToEllipse(point, box) <= tolerance) return true;
      if (el.fill === null) return false;
      // Filled, so the inside counts too: normalised radius <= 1.
      const rx = box.w / 2;
      const ry = box.h / 2;
      if (rx <= 0 || ry <= 0) return false;
      return Math.hypot((point.x - (box.x + rx)) / rx, (point.y - (box.y + ry)) / ry) <= 1;
    }
    case "line":
      return (
        distanceToSegment(point, { x: el.x, y: el.y }, { x: el.x + el.w, y: el.y + el.h }) <=
        tolerance
      );
    case "path":
      return distanceToPolyline(point, points ?? [], { x: el.x, y: el.y }) <= tolerance;
  }
}

/**
 * The topmost element under the pointer.
 *
 * `ordered` is the paint order, so this walks it backwards: the last thing
 * painted is the first thing you can grab.
 */
export function topmostAt(
  ordered: readonly ElementSnapshot[],
  point: Point,
  scale: number,
  pointsOf?: (id: string) => readonly number[] | undefined,
): ElementSnapshot | null {
  for (let i = ordered.length - 1; i >= 0; i--) {
    const el = ordered[i];
    if (hitTest(el, point, scale, pointsOf?.(el.id))) return el;
  }
  return null;
}

/** Everything the marquee touches. Order is preserved. */
export function elementsInRect(
  ordered: readonly ElementSnapshot[],
  marquee: Rect,
): ElementSnapshot[] {
  return ordered.filter((el) => rectsIntersect(bboxOf(el), marquee));
}

/** Where a handle sits on a rect, in board coordinates. */
export function handlePosition(rect: Rect, handle: Handle): Point {
  const midX = rect.x + rect.w / 2;
  const midY = rect.y + rect.h / 2;
  const right = rect.x + rect.w;
  const bottom = rect.y + rect.h;
  switch (handle) {
    case "nw": return { x: rect.x, y: rect.y };
    case "n": return { x: midX, y: rect.y };
    case "ne": return { x: right, y: rect.y };
    case "e": return { x: right, y: midY };
    case "se": return { x: right, y: bottom };
    case "s": return { x: midX, y: bottom };
    case "sw": return { x: rect.x, y: bottom };
    case "w": return { x: rect.x, y: midY };
  }
}

/**
 * Drag a handle to a point and get the new rect.
 *
 * Edges clamp at MIN_SIZE rather than flipping through zero: a note that turns
 * inside out mid-drag is disorienting, and §10.7 gives it a minimum size anyway.
 */
export function resizeRect(rect: Rect, handle: Handle, to: Point): Rect {
  let { x, y } = rect;
  let right = rect.x + rect.w;
  let bottom = rect.y + rect.h;

  if (handle.includes("w")) x = Math.min(to.x, right - MIN_SIZE);
  if (handle.includes("e")) right = Math.max(to.x, x + MIN_SIZE);
  if (handle.includes("n")) y = Math.min(to.y, bottom - MIN_SIZE);
  if (handle.includes("s")) bottom = Math.max(to.y, y + MIN_SIZE);

  return { x, y, w: right - x, h: bottom - y };
}
