// Signed direct-to-Cloudinary uploads.
//
// The browser never receives the API secret — it receives a signature scoped to
// one deterministic public_id, valid for one hour. Because the id is derived
// from the board or user rather than supplied by the caller, a signature cannot
// be pointed at somebody else's asset.
import { Router } from "express";
import { z } from "zod";
import { optionalSession } from "../../auth/middleware.js";
import { findBoardLifecycle, isExpired } from "../../boards/service.js";
import { featureEnabled } from "../../config/env.js";
import { signUpload } from "../../media/cloudinary.js";
import { limitByIp, RULES } from "../../redis/rate-limit.js";
import { validate } from "../middleware/validate.js";

export const uploadsRouter = Router();

const signSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("thumbnail"), boardId: z.string().min(3).max(32) }),
  z.object({ kind: z.literal("avatar") }),
]);

uploadsRouter.post(
  "/signature",
  limitByIp(RULES.uploadSignPerSession),
  optionalSession,
  validate(signSchema),
  async (req, res) => {
    if (!featureEnabled.cloudinary) {
      res.status(503).json({
        error: {
          message: "Image uploads aren't configured on this server.",
          next: "Set the Cloudinary credentials to enable thumbnails and avatars.",
        },
      });
      return;
    }

    const body = req.body as z.infer<typeof signSchema>;

    if (body.kind === "avatar") {
      if (!req.user) {
        res.status(401).json({
          error: {
            message: "Changing an avatar needs you to be signed in.",
            next: "Sign in from /signin, then try again.",
          },
        });
        return;
      }
      res.json(signUpload("avatar", req.user.id));
      return;
    }

    // Thumbnails follow the same rule as the canvas: anyone who can open the
    // board can write its thumbnail, because anyone who can open it can edit it.
    const board = await findBoardLifecycle(body.boardId);
    if (!board || isExpired(board)) {
      res.status(404).json({
        error: {
          message: "No live board exists at that id.",
          next: "Check the board link and try again.",
        },
      });
      return;
    }

    res.json(signUpload("thumbnail", board.id));
  },
);
