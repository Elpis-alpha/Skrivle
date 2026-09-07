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

// Guidance for the drawing tools, which land next:
//
//  - Every gesture goes through doc.transact() so it becomes ONE update, not
//    one per pointer sample.
//  - Freehand strokes append into a Y.Array<number> inside the element, so a
//    long stroke appends rather than rewrites — that is what keeps updates
//    well under MAX_UPDATE_BYTES.
//  - Pan/zoom is local view state and NEVER enters the doc. Put the camera in
//    Yjs and every peer's screen fights for control of the viewport.
