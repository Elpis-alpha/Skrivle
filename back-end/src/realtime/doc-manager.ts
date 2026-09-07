// In-memory Yjs document registry — docs/ARCHITECTURE.md#real-time-sync-model.
//
// One Y.Doc per board, kept in memory while at least one client is connected,
// rehydrated from board_docs on first join and released when the room empties.
import * as Y from "yjs";
import { loadDocState } from "./board-store.js";

type DocEntry = {
  doc: Y.Doc;
  /** Socket ids currently in this board's room. */
  sockets: Set<string>;
  /** Has the doc changed since the last snapshot? */
  dirty: boolean;
  /**
   * Resolves once the stored snapshot has been applied. Two clients joining at
   * the same moment must not both rehydrate — the second awaits the first's
   * load rather than starting its own.
   */
  ready: Promise<void>;
};

const docs = new Map<string, DocEntry>();

/**
 * The live document for a board, rehydrated from storage on first access.
 *
 * Applying the snapshot inside a transaction tagged "rehydrate" lets update
 * handlers tell restored history apart from a live client edit, so reloading a
 * board does not immediately mark it dirty and rewrite an identical blob.
 */
export async function acquireDoc(boardId: string): Promise<Y.Doc> {
  const existing = docs.get(boardId);
  if (existing) {
    await existing.ready;
    return existing.doc;
  }

  const doc = new Y.Doc();
  const entry: DocEntry = {
    doc,
    sockets: new Set(),
    dirty: false,
    ready: (async () => {
      const snapshot = await loadDocState(boardId);
      if (snapshot) Y.applyUpdate(doc, snapshot, "rehydrate");
    })(),
  };
  docs.set(boardId, entry);

  try {
    await entry.ready;
  } catch (err) {
    // A board that cannot load must not be served as an empty canvas — that
    // would let clients overwrite the stored doc with nothing.
    docs.delete(boardId);
    throw err;
  }

  return doc;
}

/**
 * The doc for a board if it is already in memory, without creating one.
 * The snapshot writer uses this: a board nobody has joined has nothing to save.
 */
export function peekDoc(boardId: string): Y.Doc | null {
  return docs.get(boardId)?.doc ?? null;
}

/** Record that a socket joined a board's room. */
export function trackSocket(boardId: string, socketId: string): void {
  docs.get(boardId)?.sockets.add(socketId);
}

/**
 * Record that a socket left. Returns true when the board's room is now empty,
 * signalling the caller to flush a final snapshot and release the doc.
 */
export function untrackSocket(boardId: string, socketId: string): boolean {
  const entry = docs.get(boardId);
  if (!entry) return false;
  entry.sockets.delete(socketId);
  return entry.sockets.size === 0;
}

/** How many sockets are in a board's room. */
export function socketCount(boardId: string): number {
  return docs.get(boardId)?.sockets.size ?? 0;
}

/** Mark a board's doc as needing a snapshot. */
export function markDirty(boardId: string): void {
  const entry = docs.get(boardId);
  if (entry) entry.dirty = true;
}

/** Clear the dirty flag — called only once a write has actually landed. */
export function clearDirty(boardId: string): void {
  const entry = docs.get(boardId);
  if (entry) entry.dirty = false;
}

/** Boards with unsaved changes — used by the snapshot sweep. */
export function dirtyBoardIds(): string[] {
  return [...docs.entries()].filter(([, e]) => e.dirty).map(([id]) => id);
}

/** Drop a board's doc from memory. Call only after its final snapshot lands. */
export function releaseDoc(boardId: string): void {
  const entry = docs.get(boardId);
  if (!entry) return;
  entry.doc.destroy();
  docs.delete(boardId);
}

/** Test seam — drops all in-memory state without persisting. */
export function resetRegistry(): void {
  for (const entry of docs.values()) entry.doc.destroy();
  docs.clear();
}
