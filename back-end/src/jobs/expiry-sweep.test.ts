import { beforeEach, describe, expect, it, vi } from "vitest";

const deleted: string[][] = [];
vi.mock("../media/cloudinary.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../media/cloudinary.js")>();
  return {
    ...actual,
    deleteAssets: vi.fn(async (ids: string[]) => {
      deleted.push(ids);
    }),
  };
});

const { sweepExpiredBoards } = await import("./expiry-sweep.js");
const { prisma } = await import("../db/prisma.js");
const { createBoard } = await import("../boards/service.js");
const { acquireDoc, resetRegistry } = await import("../realtime/doc-manager.js");
const { publicIdFor } = await import("../media/cloudinary.js");

beforeEach(async () => {
  deleted.length = 0;
  resetRegistry();
  await prisma.boardDoc.deleteMany();
  await prisma.board.deleteMany();
  await prisma.user.deleteMany();
});

async function expiredBoard(thumbnail = false) {
  const { board } = await createBoard({});
  return prisma.board.update({
    where: { id: board.id },
    data: {
      expiresAt: new Date(Date.now() - 60_000),
      ...(thumbnail ? { thumbnailId: publicIdFor("thumbnail", board.id) } : {}),
    },
  });
}

describe("sweepExpiredBoards", () => {
  it("deletes a board past its expiry", async () => {
    const board = await expiredBoard();
    const result = await sweepExpiredBoards();

    expect(result.deleted).toBe(1);
    expect(await prisma.board.findUnique({ where: { id: board.id } })).toBeNull();
  });

  it("leaves live boards alone", async () => {
    await createBoard({});
    expect((await sweepExpiredBoards()).deleted).toBe(0);
    expect(await prisma.board.count()).toBe(1);
  });

  it("never touches a board with no expiry — an owned board is permanent", async () => {
    const user = await prisma.user.create({
      data: { email: "owner@example.com", name: "Owner" },
    });
    await createBoard({ userId: user.id });

    expect((await sweepExpiredBoards()).deleted).toBe(0);
    expect(await prisma.board.count()).toBe(1);
  });

  it("cascades to the stored document", async () => {
    const board = await expiredBoard();
    await prisma.boardDoc.create({
      data: { boardId: board.id, docState: Buffer.from([1, 2, 3]) },
    });

    await sweepExpiredBoards();
    expect(await prisma.boardDoc.count()).toBe(0);
  });

  it("removes the Cloudinary thumbnail, which no cascade would reach", async () => {
    const board = await expiredBoard(true);
    await sweepExpiredBoards();

    expect(deleted).toHaveLength(1);
    expect(deleted[0]).toEqual([publicIdFor("thumbnail", board.id)]);
  });

  it("does not call Cloudinary for boards that never had a thumbnail", async () => {
    await expiredBoard(false);
    await sweepExpiredBoards();
    expect(deleted[0] ?? []).toEqual([]);
  });

  it("skips a board someone is still connected to", async () => {
    // Expiring a canvas out from under a live editor is worse than keeping it
    // a few minutes longer; the next pass collects it.
    const board = await expiredBoard();
    await acquireDoc(board.id);

    const result = await sweepExpiredBoards();
    expect(result.deleted).toBe(0);
    expect(result.skipped).toBe(1);
    expect(await prisma.board.count()).toBe(1);
  });

  it("collects the board once the last editor has left", async () => {
    const board = await expiredBoard();
    await acquireDoc(board.id);
    expect((await sweepExpiredBoards()).skipped).toBe(1);

    resetRegistry();
    expect((await sweepExpiredBoards()).deleted).toBe(1);
  });

  it("handles a mixed batch", async () => {
    await expiredBoard();
    await expiredBoard();
    await createBoard({});

    expect((await sweepExpiredBoards()).deleted).toBe(2);
    expect(await prisma.board.count()).toBe(1);
  });
});
