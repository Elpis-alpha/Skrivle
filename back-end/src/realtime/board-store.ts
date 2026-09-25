// The Postgres side of board documents: load and save the Yjs blob.
//
// Split out from snapshot-writer.ts so that doc-manager (which loads) and
// snapshot-writer (which saves) both depend on this rather than on each other.
import { prisma } from "../db/prisma.js";

/** The stored doc state for a board, or null if it has never been saved. */
export async function loadDocState(boardId: string): Promise<Uint8Array | null> {
  const row = await prisma.boardDoc.findUnique({
    where: { boardId },
    select: { docState: true },
  });
  return row ? new Uint8Array(row.docState) : null;
}

/**
 * Write a board's doc state, replacing whatever was there.
 *
 * Takes the state already encoded rather than the doc, so the caller decides
 * exactly which moment is being saved (see persistSnapshot).
 *
 * `boards.updatedAt` is touched in the same transaction because it is what the
 * My Boards tile shows as "edited 2h ago" (STYLE_GUIDE §10.15) — letting the
 * two drift would make the list lie about recent work.
 */
export async function saveDocState(boardId: string, state: Uint8Array): Promise<void> {
  const docState = Buffer.from(state);

  await prisma.$transaction([
    prisma.boardDoc.upsert({
      where: { boardId },
      create: { boardId, docState },
      update: { docState },
    }),
    prisma.board.update({ where: { id: boardId }, data: { updatedAt: new Date() } }),
  ]);
}
