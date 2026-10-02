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
//
// Between snapshots, realtime/update-log.ts holds what a crash would otherwise
// take. Each snapshot seals that log as it encodes and trims it once it lands.
import * as Y from "yjs";
import { reportError } from "../errors/report.js";
import { saveDocState } from "./board-store.js";
import { clearDirty, dirtyBoardIds, markDirty, peekDoc, setBytes } from "./doc-manager.js";
import { sealLog, trimLog } from "./update-log.js";

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
    reportError("snapshot", (failure as PromiseRejectedResult).reason);
  }
  if (failed.length > 0) {
    console.error(`[skrivle] snapshot flush: ${failed.length}/${ids.length} boards failed`);
  }
}

/** The write in flight for each board, so the next one can wait its turn. */
const writing = new Map<string, Promise<void>>();

/**
 * Persist one board's current doc state.
 *
 * One write at a time per board. Two overlapping ones — the sweep's and the
 * last person leaving — could land out of order, leaving the older blob in
 * Postgres after the newer one had trimmed the log that covered the difference.
 * With nothing in flight the write starts in this tick, so the caller decides
 * the moment being saved.
 */
export function persistSnapshot(boardId: string): Promise<void> {
  const before = writing.get(boardId);
  const run = () => writeSnapshot(boardId);
  const mine = before ? before.then(run, run) : run();

  writing.set(boardId, mine);
  const done = () => {
    if (writing.get(boardId) === mine) writing.delete(boardId);
  };
  mine.then(done, done);
  return mine;
}

/**
 * The dirty flag is cleared in the same tick the state is encoded, not after
 * the write lands. Clearing it afterwards also cleared it for any edit that
 * arrived during the write — an edit the blob doesn't contain — and shutdown
 * only flushes boards still flagged, so that edit was lost on every deploy. A
 * failed write flags the board again, leaving it queued for the next sweep.
 *
 * The log is sealed in that tick too, for the same reason: the seal has to sit
 * between the updates this blob holds and the ones it doesn't.
 */
async function writeSnapshot(boardId: string): Promise<void> {
  const doc = peekDoc(boardId);
  if (!doc) return;

  const state = Y.encodeStateAsUpdate(doc);
  clearDirty(boardId);
  setBytes(boardId, state.byteLength);
  const sealed = sealLog(boardId);

  try {
    await saveDocState(boardId, state);
  } catch (err) {
    markDirty(boardId);
    throw err;
  }
  await trimLog(boardId, await sealed);
}
