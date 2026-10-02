import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as Y from "yjs";
import { createBoard } from "../boards/service.js";
import { prisma } from "../db/prisma.js";
import { useRedis } from "../test/redis-harness.js";
import { loadDocState } from "./board-store.js";
import { acquireDoc, dirtyBoardIds, markDirty, resetRegistry } from "./doc-manager.js";
import { persistSnapshot } from "./snapshot-writer.js";

// A snapshot seals and trims the board's update log, which is in Redis.
useRedis();

beforeEach(async () => {
  resetRegistry();
  await prisma.boardDoc.deleteMany();
  await prisma.board.deleteMany();
  await prisma.user.deleteMany();
});

afterEach(() => {
  vi.restoreAllMocks();
});

/** A board someone has open, so its doc is live in memory. */
async function liveBoard(): Promise<{ id: string; doc: Y.Doc }> {
  const { board } = await createBoard({});
  return { id: board.id, doc: await acquireDoc(board.id) };
}

/** A client's edit as the bridge applies it: into the doc, then queued for saving. */
function edit(id: string, doc: Y.Doc, key: string): void {
  doc.getMap("meta").set(key, true);
  markDirty(id);
}

/** Whether a fresh load of the board would see this edit. */
async function savedHas(id: string, key: string): Promise<boolean> {
  const state = await loadDocState(id);
  const doc = new Y.Doc();
  if (state) Y.applyUpdate(doc, state);
  return doc.getMap("meta").get(key) === true;
}

describe("persistSnapshot", () => {
  it("saves the board and takes it off the queue", async () => {
    const { id, doc } = await liveBoard();
    edit(id, doc, "first");

    await persistSnapshot(id);

    expect(dirtyBoardIds()).not.toContain(id);
    expect(await savedHas(id, "first")).toBe(true);
  });

  // Shutdown only flushes boards still queued, so an edit wrongly taken off the
  // queue here was lost on every deploy.
  it("keeps an edit that lands while the write is in flight queued for the next one", async () => {
    const { id, doc } = await liveBoard();
    edit(id, doc, "before");

    const writing = persistSnapshot(id);
    edit(id, doc, "during");
    await writing;

    expect(dirtyBoardIds()).toContain(id);
    await persistSnapshot(id);
    expect(await savedHas(id, "during")).toBe(true);
  });

  it("leaves the board queued when the write fails", async () => {
    const { id, doc } = await liveBoard();
    edit(id, doc, "first");
    vi.spyOn(prisma, "$transaction").mockRejectedValueOnce(new Error("database went away"));

    await expect(persistSnapshot(id)).rejects.toThrow("database went away");

    expect(dirtyBoardIds()).toContain(id);
  });
});
