import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as Y from "yjs";
import { createBoard, deleteBoard } from "../boards/service.js";
import { prisma } from "../db/prisma.js";
import { flushTestKeys, useRedis } from "../test/redis-harness.js";
import { loadDocState } from "./board-store.js";
import { acquireDoc, dirtyBoardIds, markDirty, resetRegistry } from "./doc-manager.js";
import { redis } from "../redis/client.js";
import { persistSnapshot, stopSnapshotWriter } from "./snapshot-writer.js";
import { appendUpdate, readUpdates, sealLog, trimLog } from "./update-log.js";

useRedis();

beforeEach(async () => {
  resetRegistry();
  await flushTestKeys("ulog:*");
  await prisma.boardDoc.deleteMany();
  await prisma.board.deleteMany();
  await prisma.user.deleteMany();
});

afterEach(() => {
  vi.restoreAllMocks();
});

async function liveBoard(): Promise<{ id: string; doc: Y.Doc }> {
  const { board } = await createBoard({});
  return { id: board.id, doc: await acquireDoc(board.id) };
}

/** A client's edit as the bridge applies it: into the doc, queued, and logged. */
function edit(id: string, doc: Y.Doc, key: string): void {
  const before = Y.encodeStateVector(doc);
  doc.getMap("meta").set(key, true);
  markDirty(id);
  appendUpdate(id, Y.encodeStateAsUpdate(doc, before));
}

/** The process dying: memory gone, nothing flushed. */
function crash(): void {
  resetRegistry();
}

function has(doc: Y.Doc, key: string): boolean {
  return doc.getMap("meta").get(key) === true;
}

async function savedHas(id: string, key: string): Promise<boolean> {
  const state = await loadDocState(id);
  const doc = new Y.Doc();
  if (state) Y.applyUpdate(doc, state);
  return has(doc, key);
}

describe("the update log", () => {
  it("brings back an edit that was never snapshotted", async () => {
    const { id, doc } = await liveBoard();
    edit(id, doc, "unsaved");
    expect(await savedHas(id, "unsaved")).toBe(false);

    crash();

    expect(has(await acquireDoc(id), "unsaved")).toBe(true);
  });

  it("layers the log over the last snapshot", async () => {
    const { id, doc } = await liveBoard();
    edit(id, doc, "saved");
    await persistSnapshot(id);
    edit(id, doc, "after");

    crash();

    const back = await acquireDoc(id);
    expect(has(back, "saved")).toBe(true);
    expect(has(back, "after")).toBe(true);
  });

  // The recovered edit is in the log and nowhere else. It has to be queued for
  // a snapshot, since a snapshot is also the only thing that trims the log.
  it("queues a board it recovered work for, and trims the log once that is saved", async () => {
    const { id, doc } = await liveBoard();
    edit(id, doc, "unsaved");
    crash();

    await acquireDoc(id);
    expect(dirtyBoardIds()).toContain(id);

    await persistSnapshot(id);
    expect(await savedHas(id, "unsaved")).toBe(true);
    expect(await readUpdates(id)).toHaveLength(0);
  });

  it("does not queue a board whose log is empty", async () => {
    const { id, doc } = await liveBoard();
    edit(id, doc, "saved");
    await persistSnapshot(id);
    crash();

    await acquireDoc(id);

    expect(dirtyBoardIds()).not.toContain(id);
  });

  it("is emptied by a snapshot of everything in it", async () => {
    const { id, doc } = await liveBoard();
    edit(id, doc, "one");
    edit(id, doc, "two");

    await persistSnapshot(id);

    expect(await readUpdates(id)).toHaveLength(0);
  });

  // The edit the blob doesn't hold is exactly the one the log must still have.
  it("keeps an edit that lands while the snapshot is being written", async () => {
    const { id, doc } = await liveBoard();
    edit(id, doc, "before");

    const writing = persistSnapshot(id);
    edit(id, doc, "during");
    await writing;

    expect(await readUpdates(id)).toHaveLength(1);
    crash();
    expect(has(await acquireDoc(id), "during")).toBe(true);
  });

  it("keeps everything when the snapshot fails", async () => {
    const { id, doc } = await liveBoard();
    edit(id, doc, "first");
    vi.spyOn(prisma, "$transaction").mockRejectedValueOnce(new Error("database went away"));

    await expect(persistSnapshot(id)).rejects.toThrow("database went away");

    expect(await readUpdates(id)).toHaveLength(1);
    // The seal the failed write left behind goes with the next one that lands.
    await persistSnapshot(id);
    expect(await readUpdates(id)).toHaveLength(0);
  });

  it("is left alone by a trim whose seal isn't in it", async () => {
    const { id, doc } = await liveBoard();
    edit(id, doc, "kept");

    await trimLog(id, "s:never-written");
    await trimLog(id, null);

    expect(await readUpdates(id)).toHaveLength(1);
  });

  it("is cut just past the seal, not past whatever follows it", async () => {
    const { id, doc } = await liveBoard();
    edit(id, doc, "before");
    const base = Y.encodeStateAsUpdate(doc);
    const seal = await sealLog(id);
    edit(id, doc, "after");

    await trimLog(id, seal);

    const left = await readUpdates(id);
    expect(left).toHaveLength(1);
    const replayed = new Y.Doc();
    Y.applyUpdate(replayed, base);
    Y.applyUpdate(replayed, left[0]!);
    expect(has(replayed, "after")).toBe(true);
  });

  it("skips an entry it cannot read rather than losing the board", async () => {
    const { id, doc } = await liveBoard();
    edit(id, doc, "good");
    appendUpdate(id, new Uint8Array([255, 255, 255, 255]));
    crash();

    expect(has(await acquireDoc(id), "good")).toBe(true);
  });

  it("goes when its board is deleted", async () => {
    const user = await prisma.user.create({ data: { email: "o@example.com", name: "Owner" } });
    const { board } = await createBoard({ userId: user.id });
    const doc = await acquireDoc(board.id);
    edit(board.id, doc, "doomed");

    await deleteBoard(board.id, user.id);

    expect(await readUpdates(board.id)).toHaveLength(0);
  });
});

// node-redis queues a command while disconnected and waits for as long as that
// takes. None of this may wait with it: Postgres is where boards are kept.
describe("with Redis down", () => {
  const down = () => vi.spyOn(redis, "isReady", "get").mockReturnValue(false);

  it("still saves the board", async () => {
    const { id, doc } = await liveBoard();
    down();
    edit(id, doc, "first");

    await persistSnapshot(id);

    expect(await savedHas(id, "first")).toBe(true);
  });

  // Serving it without its log would let the next snapshot trim away work the
  // server had accepted.
  it("refuses to load a board rather than load it without its log", async () => {
    const { board } = await createBoard({});
    down();

    await expect(acquireDoc(board.id)).rejects.toThrow(/update log is unavailable/);
  });
});

describe("shutdown", () => {
  // Closing the sockets starts a write for each board's last one out. Those
  // have already left the dirty queue, so the flush alone would not wait.
  it("waits for a snapshot that is already being written", async () => {
    const { id, doc } = await liveBoard();
    edit(id, doc, "leaving");

    const real = prisma.$transaction.bind(prisma) as (...args: unknown[]) => Promise<unknown>;
    vi.spyOn(prisma, "$transaction").mockImplementationOnce((async (...args: unknown[]) => {
      await new Promise((r) => setTimeout(r, 150));
      return real(...args);
    }) as never);

    void persistSnapshot(id);
    await stopSnapshotWriter();

    expect(await savedHas(id, "leaving")).toBe(true);
  });
});

describe("persistSnapshot, one write at a time", () => {
  // Two writes in flight could land out of order: the older blob last, after
  // the newer one had already trimmed the log covering the difference.
  it("never lets an older snapshot land after a newer one", async () => {
    const { id, doc } = await liveBoard();
    edit(id, doc, "first");

    const real = prisma.$transaction.bind(prisma) as (...args: unknown[]) => Promise<unknown>;
    vi.spyOn(prisma, "$transaction").mockImplementationOnce((async (...args: unknown[]) => {
      await new Promise((r) => setTimeout(r, 150));
      return real(...args);
    }) as never);

    const slow = persistSnapshot(id);
    edit(id, doc, "second");
    const fast = persistSnapshot(id);
    await Promise.all([slow, fast]);

    expect(await savedHas(id, "second")).toBe(true);
    expect(await readUpdates(id)).toHaveLength(0);
  });
});
