// Board REST — docs/ARCHITECTURE.md#board-identity + #ephemeral-boards--expiry.
// Board-id helpers live in src/boards/board-id.ts; the logic in src/boards/service.ts.
import { Router } from "express";
import { z } from "zod";
import { ID_PATTERN } from "../../boards/board-id.js";
import {
  BoardIdTaken,
  claimBoard,
  createBoard,
  deleteBoard,
  extendBoard,
  findBoard,
  InvalidBoardId,
  isAvailable,
  isExpired,
  listBoards,
  renameBoard,
  roleOf,
} from "../../boards/service.js";
import { optionalSession, requireSession } from "../../auth/middleware.js";
import { ownsPublicId, thumbnailUrl } from "../../media/cloudinary.js";
import { prisma } from "../../db/prisma.js";
import { limitByIp, RULES } from "../../redis/rate-limit.js";
import { validate } from "../middleware/validate.js";

export const boardsRouter = Router();

const createSchema = z.object({
  customId: z.string().trim().min(3).max(32).optional(),
  title: z.string().trim().max(120).optional(),
});

const renameSchema = z.object({
  title: z.string().trim().min(1).max(120),
});

const idParam = z.object({
  id: z.string().regex(ID_PATTERN, "must be 3-32 letters, numbers, or hyphens"),
});

/** Board metadata as the browser sees it. */
function publicBoard(board: {
  id: string;
  title: string;
  isEphemeral: boolean;
  expiresAt: Date | null;
  ownerId: string | null;
  updatedAt: Date;
  thumbnailId: string | null;
}) {
  return {
    id: board.id,
    title: board.title,
    isEphemeral: board.isEphemeral,
    expiresAt: board.expiresAt,
    updatedAt: board.updatedAt,
    hasOwner: board.ownerId !== null,
    thumbnailUrl: thumbnailUrl(board.thumbnailId),
  };
}

/**
 * The board id from a route validated by `validate(idParam, "params")`.
 *
 * Express 5 types params as `string | string[]` because a path can repeat a
 * name. Ours cannot, and the validator has already proved the shape, so this
 * narrows in one place rather than at every call site.
 */
function boardIdOf(req: import("express").Request): string {
  return (req.params as { id: string }).id;
}

// --- Create ------------------------------------------------------------------

boardsRouter.post(
  "/",
  limitByIp(RULES.boardCreatePerIp),
  optionalSession,
  validate(createSchema),
  async (req, res) => {
    const { customId, title } = req.body as z.infer<typeof createSchema>;

    try {
      const { board, creatorToken } = await createBoard({
        customId,
        title,
        userId: req.user?.id,
      });
      res.status(201).json({ ...publicBoard(board), creatorToken });
    } catch (err) {
      if (err instanceof BoardIdTaken) {
        res.status(409).json({
          error: {
            message: `The board id "${err.id}" is already taken.`,
            next: "Pick a different id, or leave it blank for a generated one.",
          },
        });
        return;
      }
      if (err instanceof InvalidBoardId) {
        res.status(400).json({
          error: {
            message: `"${err.id}" isn't a usable board id.`,
            next: "Use 3-32 letters, numbers, or hyphens.",
          },
        });
        return;
      }
      throw err;
    }
  },
);

// --- My Boards ---------------------------------------------------------------

boardsRouter.get("/", requireSession, async (req, res) => {
  const boards = await listBoards(req.user!.id);
  res.json({
    boards: boards.map((board) => ({
      id: board.id,
      title: board.title,
      updatedAt: board.updatedAt,
      role: board.role,
      thumbnailUrl: thumbnailUrl(board.thumbnailId),
    })),
  });
});

// --- Availability ------------------------------------------------------------
//
// Registered before /:id so "available" is never read as a board id.

boardsRouter.get(
  "/:id/available",
  limitByIp(RULES.availabilityPerIp),
  validate(idParam, "params"),
  async (req, res) => {
    res.json({ available: await isAvailable(boardIdOf(req)) });
  },
);

// --- Lookup ------------------------------------------------------------------

boardsRouter.get("/:id", validate(idParam, "params"), optionalSession, async (req, res) => {
  const board = await findBoard(boardIdOf(req));

  if (!board) {
    res.status(404).json({
      error: {
        message: "No board exists at that id.",
        next: "Check the link, or create a new board with this id.",
      },
    });
    return;
  }

  // 410 rather than 404: the board was real and is gone, which is a different
  // thing to say to the user (STYLE_GUIDE §10.21 specifies distinct states).
  if (isExpired(board)) {
    res.status(410).json({
      error: {
        message: "That board has expired.",
        next: "Guest boards last 24 hours. Create a new board to start again.",
      },
    });
    return;
  }

  const role = req.user ? await roleOf(board.id, req.user.id) : null;
  res.json({ ...publicBoard(board), role });
});

// --- Rename / delete ---------------------------------------------------------

boardsRouter.patch(
  "/:id",
  validate(idParam, "params"),
  requireSession,
  validate(renameSchema),
  async (req, res) => {
    const { title } = req.body as z.infer<typeof renameSchema>;
    const board = await renameBoard(boardIdOf(req), req.user!.id, title);
    if (!board) {
      notOwner(res, "rename");
      return;
    }
    res.json(publicBoard(board));
  },
);

boardsRouter.delete("/:id", validate(idParam, "params"), requireSession, async (req, res) => {
  const board = await deleteBoard(boardIdOf(req), req.user!.id);
  if (!board) {
    notOwner(res, "delete");
    return;
  }
  res.status(204).end();
});

/**
 * Deliberately the same response whether the board is missing or merely not
 * theirs — otherwise this endpoint reports which board ids exist.
 */
function notOwner(res: import("express").Response, action: string): void {
  res.status(403).json({
    error: {
      message: `Only the board's owner can ${action} it.`,
      next: "Ask the owner to make the change.",
    },
  });
}

// --- Extend / claim ----------------------------------------------------------

const tokenSchema = z.object({ creatorToken: z.string().min(1).max(200) });

boardsRouter.post(
  "/:id/extend",
  validate(idParam, "params"),
  validate(tokenSchema),
  async (req, res) => {
    const { creatorToken } = req.body as z.infer<typeof tokenSchema>;
    const board = await extendBoard(boardIdOf(req), creatorToken);
    if (!board) {
      res.status(403).json({
        error: {
          message: "That board can't be extended with this browser.",
          next: "Only the browser that created a guest board can extend it. Sign in to keep it permanently.",
        },
      });
      return;
    }
    res.json({ expiresAt: board.expiresAt });
  },
);

boardsRouter.post(
  "/:id/claim",
  validate(idParam, "params"),
  requireSession,
  validate(tokenSchema.partial()),
  async (req, res) => {
    const { creatorToken } = req.body as Partial<z.infer<typeof tokenSchema>>;
    const board = await claimBoard(boardIdOf(req), req.user!.id, creatorToken);
    if (!board) {
      res.status(403).json({
        error: {
          message: "That board can't be claimed.",
          next: "A board can only be claimed by the browser that created it, and only while it has no owner.",
        },
      });
      return;
    }
    res.json(publicBoard(board));
  },
);

// --- Thumbnail -----------------------------------------------------------------

const thumbnailSchema = z.object({ publicId: z.string().min(1).max(200) });

/**
 * Confirm a thumbnail the browser has just uploaded.
 *
 * No round trip to Cloudinary is needed to prove the caller owns the asset:
 * public ids are a pure function of the board id, so a caller can only name the
 * asset for a board they can already reach.
 */
boardsRouter.post(
  "/:id/thumbnail",
  validate(idParam, "params"),
  validate(thumbnailSchema),
  async (req, res) => {
    const { publicId } = req.body as z.infer<typeof thumbnailSchema>;
    const board = await findBoard(boardIdOf(req));

    if (!board || isExpired(board)) {
      res.status(404).json({
        error: {
          message: "No live board exists at that id.",
          next: "Check the board link and try again.",
        },
      });
      return;
    }

    if (!ownsPublicId("thumbnail", board.id, publicId)) {
      res.status(403).json({
        error: {
          message: "That image isn't this board's thumbnail.",
          next: "Request a fresh upload signature for this board.",
        },
      });
      return;
    }

    const updated = await prisma.board.update({
      where: { id: board.id },
      data: { thumbnailId: publicId },
    });
    res.json({ thumbnailUrl: thumbnailUrl(updated.thumbnailId) });
  },
);
