// Snapshot persistence — docs/ARCHITECTURE.md#persistence-snapshots-not-rows.
//
// Serialize a board's in-memory Y.Doc to a binary blob and write it to
// board_snapshots: periodically (~30s while dirty) and on last-user-disconnect.
// The newest row rehydrates the doc on first join.
//
// Retention (keep-latest vs last-N) is an open question — ARCHITECTURE.md
// "Open questions". The skeleton assumes keep-latest; confirm before Phase 1.

export const SNAPSHOT_INTERVAL_MS = 30_000;

/** Start the periodic sweep that persists dirty docs. */
export function startSnapshotWriter(): void {
  // TODO(Phase 1): setInterval every SNAPSHOT_INTERVAL_MS; for each id from
  // doc-manager.dirtyBoardIds(), persist(id) then clear the dirty flag.
  console.log(
    `[skrivle] snapshot writer registered (stub) — interval ${SNAPSHOT_INTERVAL_MS}ms`,
  );
}

/**
 * Persist one board's current doc state.
 * TODO(Phase 1): Y.encodeStateAsUpdate(getDoc(boardId)) -> prisma.boardSnapshot.create.
 */
export async function persistSnapshot(_boardId: string): Promise<void> {
  throw new Error("snapshot-writer.persistSnapshot is not implemented yet (Phase 1).");
}

/**
 * Load the newest snapshot for a board, or null if it has none.
 * TODO(Phase 1): prisma.boardSnapshot.findFirst({ where: { boardId }, orderBy: { createdAt: "desc" } }).
 */
export async function loadLatestSnapshot(
  _boardId: string,
): Promise<Uint8Array | null> {
  return null;
}
