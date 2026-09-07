// The shape of a board's Yjs document.
//
// Root type names ARE the wire format: renaming one orphans every snapshot
// already stored in board_docs. They are frozen here and defined nowhere else.

import type * as Y from "yjs";

export const DOC = {
  /**
   * Y.Map<elementId, Y.Map> — notes, shapes, text, strokes.
   *
   * A map keyed by id rather than an array, so two people editing different
   * elements never conflict and a delete is one key removal.
   */
  ELEMENTS: "elements",
  /**
   * Y.Array<elementId> — paint order, kept separate so a z-order change is a
   * tiny update instead of a rewrite of the element itself.
   */
  ORDER: "order",
  /**
   * Y.Map — board-level *canvas* settings. NOT board metadata: title, expiry
   * and ownership are Postgres's job and travel over REST.
   */
  META: "meta",
} as const;

export const elements = (doc: Y.Doc) =>
  doc.getMap<Y.Map<unknown>>(DOC.ELEMENTS);
export const order = (doc: Y.Doc) => doc.getArray<string>(DOC.ORDER);
export const meta = (doc: Y.Doc) => doc.getMap<unknown>(DOC.META);

/**
 * Claims every root type. Yjs fixes a root type's constructor on first access,
 * so touching one *after* a remote update has already defined it can throw or
 * hand back an untyped AbstractType. Call this before the first applyUpdate.
 */
export function claimRootTypes(doc: Y.Doc): void {
  elements(doc);
  order(doc);
  meta(doc);
}

// The element schema.
//
// Field names are wire format for the same reason the root names above are: they
// live inside every snapshot in board_docs. Adding a field is safe, renaming one
// is not.
//
// Three rules the tools inherit from the transport, worth restating here because
// breaking any of them is silent:
//
//  - Every gesture goes through doc.transact() so it becomes ONE update, not one
//    per pointer sample.
//  - Freehand strokes append into the `points` Y.Array rather than replacing it,
//    so a long stroke stays well under MAX_UPDATE_BYTES and consecutive appends
//    merge into a single item.
//  - Pan/zoom is local view state and NEVER enters the doc. Put the camera in
//    Yjs and every peer's screen fights for control of the viewport.

/** What an element is. Stored verbatim in every snapshot, so this list is frozen. */
export const KINDS = ["note", "text", "rect", "ellipse", "line", "path"] as const;
export type ElementKind = (typeof KINDS)[number];

/**
 * Stroke colours (§10.6). Exactly two, and that is deliberate: §1 spends the
 * amethyst on the primary action and your own presence only, and grants ink and
 * accent-500 as the sole exception for things the user draws.
 */
export const STROKES = ["ink", "accent"] as const;
export type StrokeColor = (typeof STROKES)[number];

/** §10.6 stroke-width segmented control. */
export const STROKE_WIDTHS = [1, 2, 4, 8] as const;
export type StrokeWidth = (typeof STROKE_WIDTHS)[number];

/** §10.7 — a new note is this big, and never smaller. */
export const NOTE_MIN = 160;

/** §10.9 — text-base to text-2xl via the size control. */
export const FONT_SIZES = [14, 18, 24, 31] as const;

/**
 * An element's scalar fields, read out of its Y.Map.
 *
 * `text` and `points` are deliberately NOT here. A Y.Map's own observer does not
 * fire for changes inside a nested Y.Text or Y.Array — only observeDeep does —
 * so nesting them in this snapshot would mean either a stale render or rebuilding
 * every scalar 60 times a second during a pen stroke. They get their own
 * subscriptions instead; see useElements.ts.
 */
export type ElementSnapshot = {
  id: string;
  kind: ElementKind;
  /** Board coordinates. Integers: lib0 encodes an int in ~3 bytes and a float in 9. */
  x: number;
  y: number;
  w: number;
  h: number;
  /**
   * Path only: where the bounding box starts relative to the anchor, both <= 0.
   *
   * A stroke's samples are relative to its first point, so drawing up or to the
   * left produces negative ones and the box has to begin before the anchor.
   * Keeping that as an offset rather than moving the anchor is what lets a move
   * stay two field writes instead of a rewrite of every sample.
   */
  bx: number;
  by: number;
  /** A NOTE_COLORS name, or null for "no fill" (§10.8's default for shapes). */
  fill: string | null;
  stroke: StrokeColor;
  strokeWidth: StrokeWidth;
  fontSize: number;
  /** Line only: draw an arrowhead at the far end. */
  arrow: boolean;
};

/** What a field falls back to when a peer on an older build never wrote it. */
export const DEFAULTS = {
  bx: 0,
  by: 0,
  fill: null,
  stroke: "ink",
  strokeWidth: 2,
  fontSize: 14,
  arrow: false,
} as const satisfies Partial<ElementSnapshot>;

export const isKind = (value: unknown): value is ElementKind =>
  typeof value === "string" && (KINDS as readonly string[]).includes(value);
