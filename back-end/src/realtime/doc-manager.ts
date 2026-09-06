// In-memory Yjs document registry — docs/ARCHITECTURE.md#real-time-sync-model.
//
// One Y.Doc per board, kept in memory while at least one client is connected.
// This part works today; rehydration and persistence (snapshot-writer.ts) are
// still stubs.
import * as Y from "yjs";

type DocEntry = {
  doc: Y.Doc;
  /** Socket ids currently in this board's room. */
  sockets: Set<string>;
  /** Has the doc changed since the last snapshot? */
  dirty: boolean;
};

const docs = new Map<string, DocEntry>();

function entryFor(boardId: string): DocEntry {
  let entry = docs.get(boardId);
  if (!entry) {
    const doc = new Y.Doc();
    // TODO(Phase 1): before the first client joins, rehydrate from the latest
    // board_snapshots blob — snapshot-writer.loadLatestSnapshot(boardId) then
    // Y.applyUpdate(doc, snapshot). For now every board starts empty.
    entry = { doc, sockets: new Set(), dirty: false };
    docs.set(boardId, entry);
  }
  return entry;
}

/** The live document for a board, created (empty) on first access. */
export function getDoc(boardId: string): Y.Doc {
  return entryFor(boardId).doc;
}

/** Record that a socket joined a board's room. */
export function trackSocket(boardId: string, socketId: string): void {
  entryFor(boardId).sockets.add(socketId);
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

/** Mark a board's doc as needing a snapshot. */
export function markDirty(boardId: string): void {
  const entry = docs.get(boardId);
  if (entry) entry.dirty = true;
}

/** Boards with unsaved changes — used by the snapshot sweep (Phase 1). */
export function dirtyBoardIds(): string[] {
  return [...docs.entries()].filter(([, e]) => e.dirty).map(([id]) => id);
}

/** Drop a board's doc from memory. Call only once its room is empty. */
export function releaseDoc(boardId: string): void {
  const entry = docs.get(boardId);
  if (!entry) return;
  entry.doc.destroy();
  docs.delete(boardId);
}
