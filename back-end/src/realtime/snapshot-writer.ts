// Snapshot persistence — docs/ARCHITECTURE.md#persistence-snapshots-not-rows.
//
// A board's live canvas is a Y.Doc in memory. This module is the only thing
// that makes it durable: periodically while dirty, on last-user-disconnect,
// and on shutdown.
//
// Retention is keep-latest — one row per board, overwritten in place (settled
// in ROADMAP.md Phase 0). A Yjs update encodes the whole document history, so
// the newest blob is self-sufficient; keeping older ones would buy recovery
// from a corrupt write at the cost of an ever-growing table and an index scan
// on every rehydrate.
import { saveDocState } from "./board-store.js";
import { clearDirty, dirtyBoardIds, peekDoc } from "./doc-manager.js";

export const SNAPSHOT_INTERVAL_MS = 30_000;

let timer: NodeJS.Timeout | null = null;

/** Start the periodic sweep that persists dirty docs. */
export function startSnapshotWriter(): void {
  if (timer) return;
  timer = setInterval(() => {
    void flushDirty();
  }, SNAPSHOT_INTERVAL_MS);
  // The interval must not hold the process open on its own.
  timer.unref();
  console.log(`[skrivle] snapshot writer running every ${SNAPSHOT_INTERVAL_MS}ms`);
}

/**
 * Stop the sweep and flush whatever is still dirty. Called on shutdown, where
 * this is the last chance to save in-flight work.
 */
export async function stopSnapshotWriter(): Promise<void> {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
  await flushDirty();
}

/** Persist every board with unsaved changes. Never throws. */
export async function flushDirty(): Promise<void> {
  const ids = dirtyBoardIds();
  if (ids.length === 0) return;

  const results = await Promise.allSettled(ids.map((id) => persistSnapshot(id)));
  const failed = results.filter((r) => r.status === "rejected");
  for (const failure of failed) {
    console.error("[skrivle] snapshot failed:", (failure as PromiseRejectedResult).reason);
  }
  if (failed.length > 0) {
    console.error(`[skrivle] snapshot flush: ${failed.length}/${ids.length} boards failed`);
  }
}

/**
 * Persist one board's current doc state.
 *
 * The dirty flag is cleared only after the write lands, so a failed write
 * leaves the board queued for the next sweep rather than silently dropping it.
 */
export async function persistSnapshot(boardId: string): Promise<void> {
  const doc = peekDoc(boardId);
  if (!doc) return;

  await saveDocState(boardId, doc);
  clearDirty(boardId);
}
