// Deletes guest boards past their expiry — docs/ARCHITECTURE.md#ephemeral-boards--expiry.
//
// Guest boards live 24 hours (extendable by 48). Without this job they would
// accumulate forever, and so would their Cloudinary thumbnails: a row deleted
// by a cascade takes the board_docs blob with it, but Cloudinary knows nothing
// about Postgres, so the asset has to be removed explicitly.
import { prisma } from "../db/prisma.js";
import { deleteAssets, publicIdFor } from "../media/cloudinary.js";
import { peekDoc } from "../realtime/doc-manager.js";

export const SWEEP_INTERVAL_MS = 15 * 60_000;

/** Deleted in batches so one sweep cannot hold a long transaction open. */
const BATCH_SIZE = 100;

let timer: NodeJS.Timeout | null = null;

export function startExpirySweep(): void {
  if (timer) return;
  timer = setInterval(() => {
    void sweepExpiredBoards();
  }, SWEEP_INTERVAL_MS);
  timer.unref();

  // One pass at boot, so a process that was down over an expiry window catches
  // up rather than waiting a full interval.
  void sweepExpiredBoards();
  console.log(`[skrivle] expiry sweep running every ${SWEEP_INTERVAL_MS / 60_000}m`);
}

export function stopExpirySweep(): void {
  if (!timer) return;
  clearInterval(timer);
  timer = null;
}

export type SweepResult = { deleted: number; skipped: number };

/**
 * Delete every board past its expiry.
 *
 * A board with people still connected is skipped: expiring the canvas out from
 * under someone mid-edit would be a worse failure than keeping it a few minutes
 * longer, and the next pass will collect it once they leave.
 */
export async function sweepExpiredBoards(now = new Date()): Promise<SweepResult> {
  let deleted = 0;
  let skipped = 0;

  try {
    const expired = await prisma.board.findMany({
      where: { expiresAt: { lte: now } },
      select: { id: true, thumbnailId: true },
      take: BATCH_SIZE,
    });
    if (expired.length === 0) return { deleted, skipped };

    const collectable = expired.filter((board) => {
      if (peekDoc(board.id)) {
        skipped++;
        return false;
      }
      return true;
    });
    if (collectable.length === 0) return { deleted, skipped };

    const ids = collectable.map((board) => board.id);

    // Assets first: a board row deleted with its thumbnail left behind is an
    // orphan nothing will ever clean up, whereas a thumbnail deleted for a row
    // that survives is merely regenerated on the next save.
    await deleteAssets(
      collectable
        .filter((board) => board.thumbnailId)
        .map((board) => publicIdFor("thumbnail", board.id)),
    );

    // board_docs and board_collaborators cascade from this.
    const result = await prisma.board.deleteMany({ where: { id: { in: ids } } });
    deleted = result.count;

    if (deleted > 0) console.log(`[skrivle] expiry sweep removed ${deleted} board(s)`);
  } catch (err) {
    console.error("[skrivle] expiry sweep failed:", err instanceof Error ? err.message : err);
  }

  return { deleted, skipped };
}
