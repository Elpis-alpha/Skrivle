// Board lifecycle: create, look up, claim, extend, rename, delete.
//
// Authorization note, because it is easy to get backwards: **anyone holding the
// link may edit a board's canvas**. That is the product (PROJECT_BRIEF.md —
// "anyone with the link joins as a guest"), and the 10-second demo depends on
// it. Roles gate *management* — rename, delete, extend, claim, and whether a
// board shows up in My Boards — not drawing.
import { Prisma, type Board, type CollaboratorRole } from "@prisma/client";
import { isValidCustomId, mintUniqueBoardId, normalizeBoardId } from "./board-id.js";
import { hashToken, randomToken, verifyToken } from "../auth/hash.js";
import { prisma } from "../db/prisma.js";

/** How long an anonymous board lives before the sweep deletes it. */
export const GUEST_TTL_HOURS = 24;
/** How much longer the creator can push it, without signing in. */
export const EXTENSION_HOURS = 48;

/** Prisma's unique-constraint violation. */
const UNIQUE_VIOLATION = "P2002";

export type CreateBoardInput = {
  customId?: string | undefined;
  title?: string | undefined;
  userId?: string | undefined;
};

export type CreatedBoard = {
  board: Board;
  /**
   * Returned exactly once, at creation. Only its hash is stored, so this is the
   * caller's only chance to keep it — the front-end puts it in localStorage.
   * Null when the creator was signed in, since ownership already covers them.
   */
  creatorToken: string | null;
};

export class BoardIdTaken extends Error {
  constructor(public readonly id: string) {
    super(`Board id "${id}" is already taken.`);
    this.name = "BoardIdTaken";
  }
}

export class InvalidBoardId extends Error {
  constructor(public readonly id: string) {
    super(`Board id "${id}" is not well-formed.`);
    this.name = "InvalidBoardId";
  }
}

function expiryFrom(hours: number, from = new Date()): Date {
  return new Date(from.getTime() + hours * 3600_000);
}

/**
 * Create a board.
 *
 * A signed-in creator gets a durable board they own. An anonymous creator gets
 * an ephemeral one plus a creator token, which is what later lets them extend
 * or claim it without ever having signed in.
 */
export async function createBoard(input: CreateBoardInput): Promise<CreatedBoard> {
  const signedIn = Boolean(input.userId);
  const creatorToken = signedIn ? null : randomToken();

  const base = {
    title: input.title?.trim() || undefined,
    ownerId: input.userId ?? null,
    isEphemeral: !signedIn,
    expiresAt: signedIn ? null : expiryFrom(GUEST_TTL_HOURS),
    creatorTokenHash: creatorToken ? hashToken(creatorToken) : null,
    ...(input.userId
      ? { collaborators: { create: { userId: input.userId, role: "owner" as CollaboratorRole } } }
      : {}),
  };

  // A custom id is the user's choice, so a collision is their problem to hear
  // about. A generated id is ours, so a collision is retried silently.
  if (input.customId !== undefined) {
    const id = normalizeBoardId(input.customId);
    if (!isValidCustomId(id)) throw new InvalidBoardId(input.customId);
    try {
      const board = await prisma.board.create({ data: { id, ...base } });
      return { board, creatorToken };
    } catch (err) {
      if (isUniqueViolation(err)) throw new BoardIdTaken(id);
      throw err;
    }
  }

  // mintUniqueBoardId's existence check is advisory — two requests can clear it
  // with the same id before either inserts — so the insert is retried on an
  // actual constraint violation rather than trusted.
  for (let attempt = 0; attempt < 5; attempt++) {
    const id = await mintUniqueBoardId(boardExists);
    try {
      const board = await prisma.board.create({ data: { id, ...base } });
      return { board, creatorToken };
    } catch (err) {
      if (!isUniqueViolation(err)) throw err;
    }
  }
  throw new Error("Could not allocate a board id.");
}

function isUniqueViolation(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === UNIQUE_VIOLATION;
}

export async function boardExists(id: string): Promise<boolean> {
  const found = await prisma.board.findUnique({
    where: { id: normalizeBoardId(id) },
    select: { id: true },
  });
  return found !== null;
}

/** True when the id is well-formed and nobody holds it. */
export async function isAvailable(id: string): Promise<boolean> {
  const normalized = normalizeBoardId(id);
  if (!isValidCustomId(normalized)) return false;
  return !(await boardExists(normalized));
}

export function isExpired(board: Pick<Board, "expiresAt">): boolean {
  return board.expiresAt !== null && board.expiresAt.getTime() <= Date.now();
}

export async function findBoard(id: string): Promise<Board | null> {
  return prisma.board.findUnique({ where: { id: normalizeBoardId(id) } });
}

/**
 * The lean version of {@link findBoard} for callers that only need to know a
 * board is alive: the Socket.IO handshake and the upload-signing endpoints.
 * `findBoard` fetches all 10 `Board` columns, including a hashed secret
 * (`creatorTokenHash`) neither of those call sites reads.
 */
export type BoardLifecycle = Pick<Board, "id" | "expiresAt">;

export async function findBoardLifecycle(id: string): Promise<BoardLifecycle | null> {
  return prisma.board.findUnique({
    where: { id: normalizeBoardId(id) },
    select: { id: true, expiresAt: true },
  });
}

/**
 * Push an ephemeral board's expiry out, proving the caller created it.
 *
 * Extension is relative to now rather than to the current expiry, so repeated
 * calls cannot stack a guest board into permanence.
 */
export async function extendBoard(
  id: string,
  creatorToken: string,
): Promise<Pick<Board, "expiresAt"> | null> {
  const board = await findBoard(id);
  if (!board || !board.creatorTokenHash) return null;
  if (!verifyToken(creatorToken, board.creatorTokenHash)) return null;
  if (!board.isEphemeral) return board;

  // The caller (the /extend route) only ever reads expiresAt back.
  return prisma.board.update({
    where: { id: board.id },
    data: { expiresAt: expiryFrom(EXTENSION_HOURS) },
    select: { expiresAt: true },
  });
}

/**
 * Take ownership of a guest board after signing in.
 *
 * Claiming needs the creator token: without it, anyone who opened a shared link
 * could take the board out from under the person who made it.
 */
export async function claimBoard(
  id: string,
  userId: string,
  creatorToken: string | undefined,
): Promise<Board | null> {
  const board = await findBoard(id);
  if (!board || board.ownerId) return null;
  if (!board.creatorTokenHash || !creatorToken) return null;
  if (!verifyToken(creatorToken, board.creatorTokenHash)) return null;

  return prisma.board.update({
    where: { id: board.id },
    data: {
      ownerId: userId,
      isEphemeral: false,
      expiresAt: null,
      // The token has done its job; keeping it would leave a second key to a
      // board that now has a real owner.
      creatorTokenHash: null,
      collaborators: {
        upsert: {
          where: { boardId_userId: { boardId: board.id, userId } },
          create: { userId, role: "owner" },
          update: { role: "owner" },
        },
      },
    },
  });
}

/** The caller's role on a board, or null if they have none. */
export async function roleOf(boardId: string, userId: string): Promise<CollaboratorRole | null> {
  const row = await prisma.boardCollaborator.findUnique({
    where: { boardId_userId: { boardId: normalizeBoardId(boardId), userId } },
    select: { role: true },
  });
  return row?.role ?? null;
}

/** Rename. Owner only — an editor can draw, but not relabel someone's board. */
export async function renameBoard(
  id: string,
  userId: string,
  title: string,
): Promise<Board | null> {
  if ((await roleOf(id, userId)) !== "owner") return null;
  return prisma.board.update({
    where: { id: normalizeBoardId(id) },
    data: { title: title.trim() },
  });
}

/** Delete. Owner only. Cascades to the doc and collaborator rows. */
export async function deleteBoard(id: string, userId: string): Promise<Board | null> {
  const board = await findBoard(id);
  if (!board) return null;
  if ((await roleOf(id, userId)) !== "owner") return null;

  await prisma.board.delete({ where: { id: board.id } });
  return board;
}

export type BoardSummary = {
  id: string;
  title: string;
  updatedAt: Date;
  role: CollaboratorRole;
  thumbnailId: string | null;
};

/**
 * "My Boards".
 *
 * Driven off board_collaborators rather than boards.ownerId, so a board shared
 * with someone appears for them too. That filters on userId alone, which is why
 * the schema carries @@index([userId]) — the composite primary key leads with
 * boardId and cannot serve this lookup.
 */
export async function listBoards(userId: string): Promise<BoardSummary[]> {
  const rows = await prisma.boardCollaborator.findMany({
    where: { userId },
    select: {
      role: true,
      board: { select: { id: true, title: true, updatedAt: true, thumbnailId: true } },
    },
    orderBy: { board: { updatedAt: "desc" } },
    take: 200,
  });

  return rows.map(({ role, board }) => ({
    id: board.id,
    title: board.title,
    updatedAt: board.updatedAt,
    role,
    thumbnailId: board.thumbnailId,
  }));
}

/** Record that someone was active on a board — drives lastActiveAt in My Boards. */
export async function touchCollaborator(boardId: string, userId: string): Promise<void> {
  await prisma.boardCollaborator.upsert({
    where: { boardId_userId: { boardId: normalizeBoardId(boardId), userId } },
    create: { boardId: normalizeBoardId(boardId), userId, role: "editor" },
    update: { lastActiveAt: new Date() },
  });
}
