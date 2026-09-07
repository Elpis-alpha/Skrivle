// The signed-in user's own profile.
import { Router } from "express";
import { z } from "zod";
import { publicUser } from "../../auth/identity.js";
import { requireSession } from "../../auth/middleware.js";
import { prisma } from "../../db/prisma.js";
import { avatarUrl, ownsPublicId } from "../../media/cloudinary.js";
import { validate } from "../middleware/validate.js";

export const meRouter = Router();

const updateSchema = z.object({
  name: z.string().trim().min(1).max(60).optional(),
  /**
   * The public_id the browser just uploaded to. Null clears a custom avatar and
   * falls back to whatever the OAuth provider supplied.
   */
  avatarPublicId: z.string().max(200).nullable().optional(),
});

meRouter.patch("/", requireSession, validate(updateSchema), async (req, res) => {
  const { name, avatarPublicId } = req.body as z.infer<typeof updateSchema>;
  const user = req.user!;

  // A caller could otherwise claim any public_id in the account, including
  // another user's avatar, and have it rendered as their own.
  if (avatarPublicId && !ownsPublicId("avatar", user.id, avatarPublicId)) {
    res.status(403).json({
      error: {
        message: "That image doesn't belong to your account.",
        next: "Request a fresh upload signature and try again.",
      },
    });
    return;
  }

  const updated = await prisma.user.update({
    where: { id: user.id },
    data: {
      ...(name !== undefined ? { name } : {}),
      ...(avatarPublicId !== undefined
        ? {
            avatarPublicId,
            // Denormalised so the common read path never re-derives a URL.
            avatarUrl: avatarPublicId ? avatarUrl(avatarPublicId) : null,
          }
        : {}),
    },
  });

  res.json({ user: publicUser(updated) });
});
