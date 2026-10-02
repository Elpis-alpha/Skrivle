// A board's doc, kept in this browser.
//
// Without it, work drawn while the socket is down exists only in the tab's
// memory: reload, or close the tab, and it is gone. With it, every change is
// also written to IndexedDB, and the next time the board opens the stored doc
// is loaded and whatever the server lacks goes up in the ordinary sync.
//
// It does not make a board open offline. The page and the board's record still
// come over the network; this only keeps what you drew until they can.
//
// A database is named for a board *and when it was created*. Board ids come
// back: a custom id can be taken again once its board is deleted or expires,
// and Yjs would merge a stored copy of the old board into the new one, for
// everybody on it, without anything looking wrong.

import type * as Y from "yjs";
import { IndexeddbPersistence } from "y-indexeddb";

const DB_PREFIX = "skrivle-board:";
const INDEX_KEY = "skrivle-local-copies";
const PROBE_DB = "skrivle-probe";

/**
 * A copy nobody has opened in this long is deleted. Guest boards are gone in
 * three days at most, and nothing else would ever clear their copies away.
 */
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

export type LocalCopy = {
  /**
   * Resolves once the stored doc has been applied — true if the copy is now
   * being kept, false if this browser can't keep one. Never rejects.
   */
  loaded: Promise<boolean>;
  destroy: () => void;
};

function nameFor(boardId: string, createdAt: string): string {
  return `${DB_PREFIX}${boardId.trim().toLowerCase()}:${createdAt}`;
}

/** Whether a database name is some incarnation of this board. */
function belongsTo(name: string, boardId: string): boolean {
  return name.startsWith(`${DB_PREFIX}${boardId.trim().toLowerCase()}:`);
}

// --- the index ---------------------------------------------------------------
//
// IndexedDB can't say when a database was last opened, and listing databases
// isn't available everywhere, so the names and their last use are kept here.
// Guarded like every other localStorage read in the product: it throws in
// Safari's private mode, and the value can always be corrupt.

type Index = Record<string, number>;

function readIndex(): Index {
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(INDEX_KEY) ?? "{}");
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const index: Index = {};
    for (const [name, at] of Object.entries(parsed)) {
      if (typeof at === "number") index[name] = at;
    }
    return index;
  } catch {
    return {};
  }
}

function writeIndex(index: Index): void {
  try {
    window.localStorage.setItem(INDEX_KEY, JSON.stringify(index));
  } catch {
    // Without the index, copies are still kept; they just aren't cleaned up.
  }
}

function deleteDatabase(name: string): void {
  try {
    indexedDB.deleteDatabase(name);
  } catch {
    // Nothing to do: it will be tried again the next time the index is swept.
  }
}

/** Drop every indexed copy that `stale` picks, and take it off the index. */
function sweep(stale: (name: string, lastOpened: number) => boolean): void {
  const index = readIndex();
  let changed = false;
  for (const [name, lastOpened] of Object.entries(index)) {
    if (!stale(name, lastOpened)) continue;
    deleteDatabase(name);
    delete index[name];
    changed = true;
  }
  if (changed) writeIndex(index);
}

/**
 * Forget this browser's copies of a board — every incarnation of it. For a
 * board the server says is gone.
 */
export function forgetLocalCopies(boardId: string): void {
  if (typeof indexedDB === "undefined") return;
  sweep((name) => belongsTo(name, boardId));
}

// --- opening -----------------------------------------------------------------

/**
 * Whether IndexedDB works here, rather than merely existing. Firefox's private
 * windows and browsers set to block site data have the API and refuse to open
 * anything, and y-indexeddb turns that refusal into an unhandled rejection.
 */
function canOpen(): Promise<boolean> {
  return new Promise((resolve) => {
    try {
      const request = indexedDB.open(PROBE_DB);
      request.onsuccess = () => {
        request.result.close();
        resolve(true);
      };
      request.onerror = () => resolve(false);
      request.onblocked = () => resolve(false);
    } catch {
      resolve(false);
    }
  });
}

/**
 * Keep `doc` in this browser, loading whatever is already stored for this
 * board into it first.
 *
 * Returns null where there is no IndexedDB at all. The stored doc is applied in
 * one transaction whose origin is not the session's REMOTE, so anything in it
 * the server lacks is sent like any other local change.
 */
export function openLocalCopy(boardId: string, createdAt: string, doc: Y.Doc): LocalCopy | null {
  if (typeof indexedDB === "undefined") return null;

  const name = nameFor(boardId, createdAt);
  let provider: IndexeddbPersistence | null = null;
  let destroyed = false;

  const loaded = canOpen()
    .then(async (usable) => {
      if (!usable || destroyed) return false;

      const now = Date.now();
      // An older incarnation of this id, and anything long unopened.
      sweep(
        (other, lastOpened) =>
          other !== name && (belongsTo(other, boardId) || now - lastOpened > MAX_AGE_MS),
      );
      writeIndex({ ...readIndex(), [name]: now });

      provider = new IndexeddbPersistence(name, doc);
      await provider.whenSynced;
      return !destroyed;
    })
    .catch(() => false);

  return {
    loaded,
    destroy() {
      destroyed = true;
      void provider?.destroy().catch(() => {});
    },
  };
}
