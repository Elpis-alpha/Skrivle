// What Copy puts on the clipboard, and what Paste will accept back.
//
// Plain JSON as text/plain, with a marker, rather than a custom MIME type:
// every browser round-trips text/plain, so a copy from one board pastes into
// another board or another tab. The marker is how a paste tells board content
// apart from whatever else someone copied.
//
// A paste writes straight into a document every peer renders, and a clipboard
// can hold anything, so parsing trusts nothing: each element is rebuilt field
// by field, anything unreadable is skipped, and the sizes are capped the way
// drawing caps them.

import type * as Y from "yjs";
import {
  elements,
  isKind,
  STROKE_WIDTHS,
  STROKES,
  type StrokeColor,
  type StrokeWidth,
} from "@/lib/realtime/doc-schema";
import { orderedIds, pointsOf, readElement, textOf, type ElementInit } from "./elements";
import { bboxOf, unionRects, type Point } from "./geometry";
import { MAX_POINTS } from "./stroke";

/** Bumped only if the payload stops being readable by older builds. */
const VERSION = 1;

/** One paste can't put more than this on the board. */
export const MAX_PASTE = 500;

/** A note's worth of text is not a novel. */
const MAX_TEXT = 10_000;

/** The selection, in paint order, as clipboard text. */
export function copyPayload(doc: Y.Doc, ids: readonly string[]): string {
  const wanted = new Set(ids);
  const els = elements(doc);

  const copied = orderedIds(doc).flatMap((id) => {
    const map = els.get(id);
    if (!wanted.has(id) || !map) return [];
    const { id: _id, ...fields } = readElement(id, map);
    const text = textOf(map)?.toString();
    const points = pointsOf(map)?.toArray();
    return [{ ...fields, ...(text === undefined ? {} : { text }), ...(points ? { points } : {}) }];
  });

  return JSON.stringify({ skrivle: VERSION, elements: copied });
}

/** Every element moved by the same amount. Rounded, as the document stores them. */
function shifted<T extends ElementInit>(inits: readonly T[], dx: number, dy: number): T[] {
  return inits.map((init) => ({ ...init, x: Math.round(init.x + dx), y: Math.round(init.y + dy) }));
}

/** The group moved so the middle of its box lands on `at`. */
export function centredOn<T extends ElementInit>(inits: readonly T[], at: Point): T[] {
  const box = unionRects(inits.map((init) => bboxOf(init)));
  if (!box) return [...inits];
  return shifted(inits, at.x - (box.x + box.w / 2), at.y - (box.y + box.h / 2));
}

/** The group moved down and right by `by`, so a copy never hides its original. */
export function nudged<T extends ElementInit>(inits: readonly T[], by: number): T[] {
  return shifted(inits, by, by);
}

/** Clipboard text back into elements to create, or null if it isn't ours. */
export function parsePayload(text: string): ElementInit[] | null {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return null;
  }
  if (!isRecord(data) || data.skrivle !== VERSION || !Array.isArray(data.elements)) return null;
  return data.elements.slice(0, MAX_PASTE).flatMap(toInit);
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const finite = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

function toInit(raw: unknown): ElementInit[] {
  if (!isRecord(raw) || !isKind(raw.kind)) return [];
  const { kind, x, y, w, h } = raw;
  if (!finite(x) || !finite(y) || !finite(w) || !finite(h)) return [];

  const init: ElementInit = { kind, x, y, w, h };
  if (finite(raw.bx)) init.bx = raw.bx;
  if (finite(raw.by)) init.by = raw.by;
  if (typeof raw.fill === "string" || raw.fill === null) init.fill = raw.fill;
  if ((STROKES as readonly unknown[]).includes(raw.stroke)) init.stroke = raw.stroke as StrokeColor;
  if ((STROKE_WIDTHS as readonly unknown[]).includes(raw.strokeWidth)) {
    init.strokeWidth = raw.strokeWidth as StrokeWidth;
  }
  if (finite(raw.fontSize) && raw.fontSize > 0) init.fontSize = raw.fontSize;
  if (raw.arrow === true) init.arrow = true;

  // Notes and text boxes always get their Y.Text, even an empty one, or there
  // is nothing for the editor to bind to.
  if (typeof raw.text === "string") init.text = raw.text.slice(0, MAX_TEXT);
  else if (kind === "note" || kind === "text") init.withText = true;

  if (kind === "path") {
    const points = Array.isArray(raw.points) ? raw.points.filter(finite) : [];
    const pairs = Math.min(Math.floor(points.length / 2), MAX_POINTS);
    // A stroke with no samples has no ink; a lone point is a dot.
    init.points = pairs > 0 ? points.slice(0, pairs * 2) : [0, 0];
  }

  return [init];
}
