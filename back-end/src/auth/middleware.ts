// Session-reading middleware.
//
// Two flavours, because Skrivle is deliberately usable signed-out: most board
// routes work for guests and only *change* behaviour when a session exists, so
// `optionalSession` is the common case and `requireSession` is the exception.
import type { NextFunction, Request, RequestHandler, Response } from "express";
import { readSession, sessionIdFrom } from "./session.js";
import { prisma } from "../db/prisma.js";
import type { User } from "@prisma/client";

/**
 * Only the fields anything actually reads off `req.user` — checked across
 * every route. Fetching the whole row would run a signed-in user's avatar
 * blob and internal timestamps through nearly every authenticated request.
 */
export type SessionUser = Pick<User, "id" | "email" | "name" | "avatarUrl">;

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      /** The signed-in user, or null for a guest. Set by optionalSession. */
      user?: SessionUser | null;
      /** The raw session token, when one was presented. */
      sessionId?: string | undefined;
    }
  }
}

/** Attach the user when a valid session cookie is present. Never rejects. */
export const optionalSession: RequestHandler = async (req, _res, next) => {
  const sessionId = sessionIdFrom(req);
  req.sessionId = sessionId;
  req.user = null;

  const record = await readSession(sessionId);
  if (record) {
    // The session may outlive the user (account deleted with sessions live),
    // so the row is the authority, not the token.
    req.user = await prisma.user.findUnique({
      where: { id: record.userId },
      select: { id: true, email: true, name: true, avatarUrl: true },
    });
  }
  next();
};

/** Reject anonymous callers. Runs optionalSession first if it has not run. */
export const requireSession: RequestHandler = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  if (req.user === undefined) await new Promise<void>((r) => optionalSession(req, res, () => r()));

  if (!req.user) {
    res.status(401).json({
      error: {
        message: "That action needs you to be signed in.",
        next: "Sign in from /signin, then try again.",
      },
    });
    return;
  }
  next();
};
