// Typed reads and writes over the board's Yjs document.
//
// Everything that changes the doc goes through here, and every writer wraps its
// change in `doc.transact(fn, LOCAL)` — one update on the wire per call, tagged
// as a local edit so the UndoManager tracks it and the transport still
// broadcasts it (see board-session.ts).
//
// Reads are defensive: a peer on a different build can write anything, and a
// board that renders NaN because someone shipped a bad field is worse than one
// that quietly falls back.

import * as Y from "yjs";
import {
  DEFAULTS,
  elements,
  isKind,
  NOTE_MIN,
  order,
  type ElementKind,
  type ElementSnapshot,
  type StrokeColor,
  type StrokeWidth,
} from "@/lib/realtime/doc-schema";
import { LOCAL } from "@/lib/realtime/board-session";
import { bboxOf, type Rect } from "./geometry";
import { MAX_POINTS } from "./stroke";

export type ElementMap = Y.Map<unknown>;

/** Short, because every id is stored twice: as a map key and as an order entry. */
export function newElementId(): string {
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(36).padStart(2, "0")).join("");
}

const num = (value: unknown, fallback: number): number =>
  typeof value === "number" && Number.isFinite(value) ? value : fallback;

/** Read an element's scalars. Never throws, whatever is in the map. */
export function readElement(id: string, map: ElementMap): ElementSnapshot {
  const kind = map.get("kind");
  const stroke = map.get("stroke");
  const strokeWidth = map.get("strokeWidth");
  const fill = map.get("fill");

  return {
    id,
    kind: isKind(kind) ? kind : "rect",
    x: Math.round(num(map.get("x"), 0)),
    y: Math.round(num(map.get("y"), 0)),
    w: Math.round(num(map.get("w"), 0)),
    h: Math.round(num(map.get("h"), 0)),
    bx: Math.round(num(map.get("bx"), DEFAULTS.bx)),
    by: Math.round(num(map.get("by"), DEFAULTS.by)),
    fill: typeof fill === "string" ? fill : DEFAULTS.fill,
    stroke: stroke === "accent" || stroke === "ink" ? stroke : DEFAULTS.stroke,
    strokeWidth: [1, 2, 4, 8].includes(strokeWidth as number)
      ? (strokeWidth as StrokeWidth)
      : DEFAULTS.strokeWidth,
    fontSize: Math.round(num(map.get("fontSize"), DEFAULTS.fontSize)),
    arrow: map.get("arrow") === true,
  };
}

export function textOf(map: ElementMap): Y.Text | null {
  const text = map.get("text");
  return text instanceof Y.Text ? text : null;
}

export function pointsOf(map: ElementMap): Y.Array<number> | null {
  const points = map.get("points");
  return points instanceof Y.Array ? points : null;
}

/**
 * The ids to paint, in order.
 *
 * `order` and `elements` are separate root types and can disagree — a peer can
 * delete an element in the same moment another appends it. Rendering follows
 * `order` and skips anything missing from `elements`; `repairOrder` handles the
 * other direction.
 */
export function orderedIds(doc: Y.Doc): string[] {
  const els = elements(doc);
  const seen = new Set<string>();
  const ids: string[] = [];
  for (const id of order(doc)) {
    if (typeof id === "string" && els.has(id) && !seen.has(id)) {
      seen.add(id);
      ids.push(id);
    }
  }
  return ids;
}

/**
 * Append any element that never made it into `order`, so it is at least
 * reachable.
 *
 * Deliberately NOT tagged LOCAL: this is maintenance, and putting it on the
 * user's undo stack would let Cmd+Z make elements vanish again.
 */
export function repairOrder(doc: Y.Doc): void {
  const listed = new Set(order(doc).toArray());
  const orphans = [...elements(doc).keys()].filter((id) => !listed.has(id));
  if (orphans.length === 0) return;
  doc.transact(() => order(doc).push(orphans));
}

export type ElementInit = {
  kind: ElementKind;
  x: number;
  y: number;
  w: number;
  h: number;
  bx?: number;
  by?: number;
  fill?: string | null;
  stroke?: StrokeColor;
  strokeWidth?: StrokeWidth;
  fontSize?: number;
  arrow?: boolean;
  /** Give the element a Y.Text so two people can type in it at once. */
  withText?: boolean;
  /** Give the element a Y.Array for pen samples. */
  points?: readonly number[];
};

/** Create an element and put it on top of the paint order. One update. */
export function createElement(doc: Y.Doc, init: ElementInit): string {
  const id = newElementId();
  doc.transact(() => {
    const map = new Y.Map<unknown>();
    map.set("kind", init.kind);
    map.set("x", Math.round(init.x));
    map.set("y", Math.round(init.y));
    map.set("w", Math.round(init.w));
    map.set("h", Math.round(init.h));
    if (init.bx) map.set("bx", Math.round(init.bx));
    if (init.by) map.set("by", Math.round(init.by));
    if (init.fill !== undefined) map.set("fill", init.fill);
    if (init.stroke !== undefined) map.set("stroke", init.stroke);
    if (init.strokeWidth !== undefined) map.set("strokeWidth", init.strokeWidth);
    if (init.fontSize !== undefined) map.set("fontSize", init.fontSize);
    if (init.arrow) map.set("arrow", true);
    if (init.withText) map.set("text", new Y.Text());
    if (init.points) map.set("points", Y.Array.from(init.points.map(Math.round)));

    elements(doc).set(id, map);
    order(doc).push([id]);
  }, LOCAL);
  return id;
}

/** A note starts at its §10.7 minimum, centred on where you clicked. */
export function createNote(
  doc: Y.Doc,
  at: { x: number; y: number },
  style: { fill: string; fontSize: number },
): string {
  return createElement(doc, {
    kind: "note",
    x: at.x - NOTE_MIN / 2,
    y: at.y - NOTE_MIN / 2,
    w: NOTE_MIN,
    h: NOTE_MIN,
    fill: style.fill,
    fontSize: style.fontSize,
    withText: true,
  });
}

export function updateElement(
  doc: Y.Doc,
  id: string,
  patch: Record<string, unknown>,
): void {
  const map = elements(doc).get(id);
  if (!map) return;
  doc.transact(() => {
    for (const [key, value] of Object.entries(patch)) {
      map.set(key, typeof value === "number" ? Math.round(value) : value);
    }
  }, LOCAL);
}

/**
 * Nudge a whole selection.
 *
 * One transaction for every element, not one each: a 20-note drag would
 * otherwise be 20 messages per tick, fanned out to every peer.
 */
export function moveBy(doc: Y.Doc, ids: readonly string[], dx: number, dy: number): void {
  if (ids.length === 0 || (dx === 0 && dy === 0)) return;
  const els = elements(doc);
  doc.transact(() => {
    for (const id of ids) {
      const map = els.get(id);
      if (!map) continue;
      map.set("x", Math.round(num(map.get("x"), 0) + dx));
      map.set("y", Math.round(num(map.get("y"), 0) + dy));
    }
  }, LOCAL);
}

/**
 * Fit an element to a new box.
 *
 * Paths hold their samples relative to the origin, so a resize scales every
 * sample. That is the one rewrite a stroke takes after it is drawn, and it is
 * bounded by the point cap.
 */
export function resizeElement(doc: Y.Doc, id: string, rect: Rect): void {
  const map = elements(doc).get(id);
  if (!map) return;

  doc.transact(() => {
    const before = bboxOf(readElement(id, map));
    const points = pointsOf(map);

    if (points && before.w > 0 && before.h > 0) {
      const scaleX = rect.w / before.w;
      const scaleY = rect.h / before.h;
      const scaled = points.toArray().map((n, i) => Math.round(n * (i % 2 === 0 ? scaleX : scaleY)));
      points.delete(0, points.length);
      points.push(scaled);

      map.set("bx", Math.round(num(map.get("bx"), 0) * scaleX));
      map.set("by", Math.round(num(map.get("by"), 0) * scaleY));
    }

    map.set("x", Math.round(rect.x));
    map.set("y", Math.round(rect.y));
    map.set("w", Math.round(rect.w));
    map.set("h", Math.round(rect.h));
  }, LOCAL);
}

export function removeElements(doc: Y.Doc, ids: readonly string[]): void {
  if (ids.length === 0) return;
  const doomed = new Set(ids);
  doc.transact(() => {
    const list = order(doc);
    // Walk backwards so each delete leaves the indices below it untouched.
    for (let i = list.length - 1; i >= 0; i--) {
      if (doomed.has(list.get(i))) list.delete(i, 1);
    }
    for (const id of doomed) elements(doc).delete(id);
  }, LOCAL);
}

/**
 * Add pen samples to a stroke and grow its bounding box.
 *
 * Appending rather than replacing is what keeps a long stroke small: consecutive
 * same-client appends merge into one Yjs item, so the stored form stays close to
 * the raw numbers.
 */
export function appendPoints(doc: Y.Doc, id: string, next: readonly number[]): void {
  if (next.length < 2) return;
  const map = elements(doc).get(id);
  if (!map) return;
  const points = pointsOf(map);
  if (!points || points.length >= MAX_POINTS * 2) return;

  doc.transact(() => {
    points.push(next.map(Math.round));

    // The bbox is what hit-testing and selection read, so it has to keep up —
    // in every direction. A stroke drawn up and to the left produces negative
    // samples, and tracking only the far corner would leave half of it
    // unselectable.
    let minX = num(map.get("bx"), 0);
    let minY = num(map.get("by"), 0);
    let maxX = minX + num(map.get("w"), 0);
    let maxY = minY + num(map.get("h"), 0);

    for (let i = 0; i + 1 < next.length; i += 2) {
      minX = Math.min(minX, next[i]);
      maxX = Math.max(maxX, next[i]);
      minY = Math.min(minY, next[i + 1]);
      maxY = Math.max(maxY, next[i + 1]);
    }

    map.set("bx", Math.round(minX));
    map.set("by", Math.round(minY));
    map.set("w", Math.round(maxX - minX));
    map.set("h", Math.round(maxY - minY));
  }, LOCAL);
}

/** Swap a stroke's samples for the simplified set, once, on pointerup. */
export function replacePoints(doc: Y.Doc, id: string, next: readonly number[]): void {
  const map = elements(doc).get(id);
  const points = map ? pointsOf(map) : null;
  if (!points) return;
  doc.transact(() => {
    points.delete(0, points.length);
    points.push(next.map(Math.round));
  }, LOCAL);
}

/**
 * Write a new string into a Y.Text as the smallest possible edit.
 *
 * Replacing the whole text would put the entire note on the wire per keystroke
 * and make two people typing at once destroy each other's characters. Diffing to
 * a single delete+insert keeps concurrent edits merging the way Y.Text is built
 * to.
 */
export function applyTextEdit(doc: Y.Doc, text: Y.Text, next: string): void {
  const current = text.toString();
  if (current === next) return;

  let prefix = 0;
  const shortest = Math.min(current.length, next.length);
  while (prefix < shortest && current[prefix] === next[prefix]) prefix++;

  let suffix = 0;
  while (
    suffix < shortest - prefix &&
    current[current.length - 1 - suffix] === next[next.length - 1 - suffix]
  ) {
    suffix++;
  }

  const removed = current.length - prefix - suffix;
  const inserted = next.slice(prefix, next.length - suffix);

  doc.transact(() => {
    if (removed > 0) text.delete(prefix, removed);
    if (inserted) text.insert(prefix, inserted);
  }, LOCAL);
}
