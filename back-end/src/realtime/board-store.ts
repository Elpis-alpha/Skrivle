// The Postgres side of board documents: load and save the Yjs blob.
//
// Split out from snapshot-writer.ts so that doc-manager (which loads) and
// snapshot-writer (which saves) both depend on this rather than on each other.
import * as Y from "yjs";
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
 * `boards.updatedAt` is touched in the same transaction because it is what the
 * My Boards tile shows as "edited 2h ago" (STYLE_GUIDE §10.15) — letting the
 * two drift would make the list lie about recent work.
 */
export async function saveDocState(boardId: string, doc: Y.Doc): Promise<void> {
  const docState = Buffer.from(Y.encodeStateAsUpdate(doc));

  await prisma.$transaction([
    prisma.boardDoc.upsert({
      where: { boardId },
      create: { boardId, docState },
      update: { docState },
    }),
    prisma.board.update({ where: { id: boardId }, data: { updatedAt: new Date() } }),
  ]);
}
