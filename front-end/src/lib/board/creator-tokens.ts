// Creator tokens for guest boards.
//
// POST /api/boards returns a creatorToken exactly once for a signed-out
// creation — the server keeps only its HMAC. It is the sole handle for
// extending or claiming that board, so it has to survive a reload, and it can
// only live in this browser.
//
// One key rather than one per board, because cleanup needs enumeration.

const STORAGE_KEY = "skrivle-boards";

/** 24h guest TTL plus one 48h extension, then it can't be useful any more. */
const MAX_AGE_MS = 72 * 60 * 60 * 1000;

type Entry = { token: string; createdAt: number; title?: string };
type Store = { v: 1; boards: Record<string, Entry> };

/** The server lowercases every id, so /board/K3M9P must find the same token. */
function normalize(boardId: string): string {
  return boardId.trim().toLowerCase();
}

// Every read and write is guarded: localStorage throws outright in Safari's
// private mode and when a browser is set to block site data, and the value can
// always be corrupt JSON written by an older build.
//
// Always returns a fresh object — callers mutate what they get back, so a
// shared empty constant would accumulate every token ever written and hand
// them out again whenever storage came back empty.
function read(): Store {
  const empty = (): Store => ({ v: 1, boards: {} });
  if (typeof window === "undefined") return empty();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return empty();
    const parsed: unknown = JSON.parse(raw);
    const boards = (parsed as Store)?.boards;
    if (!boards || typeof boards !== "object") return empty();
    return { v: 1, boards };
  } catch {
    return empty();
  }
}

function write(store: Store): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    // Out of quota or storage disabled. The board still works; it just can't be
    // extended or claimed from this browser later.
  }
}

export function rememberCreatorToken(
  boardId: string,
  token: string,
  title?: string,
): void {
  const store = read();
  store.boards[normalize(boardId)] = {
    token,
    createdAt: Date.now(),
    ...(title ? { title } : {}),
  };
  write(store);
}

export function creatorTokenFor(boardId: string): string | null {
  return read().boards[normalize(boardId)]?.token ?? null;
}

export function forgetCreatorToken(boardId: string): void {
  const store = read();
  if (!(normalize(boardId) in store.boards)) return;
  delete store.boards[normalize(boardId)];
  write(store);
}

/** Boards created in this browser, newest first. */
export function localBoards(): Array<{
  id: string;
  title?: string;
  createdAt: number;
}> {
  return Object.entries(read().boards)
    .map(([id, entry]) => ({
      id,
      createdAt: entry.createdAt,
      ...(entry.title ? { title: entry.title } : {}),
    }))
    .sort((a, b) => b.createdAt - a.createdAt);
}

/** Drops tokens too old to be worth anything. Called on every product mount. */
export function pruneCreatorTokens(now: number = Date.now()): void {
  const store = read();
  let changed = false;
  for (const [id, entry] of Object.entries(store.boards)) {
    if (now - entry.createdAt > MAX_AGE_MS) {
      delete store.boards[id];
      changed = true;
    }
  }
  if (changed) write(store);
}
