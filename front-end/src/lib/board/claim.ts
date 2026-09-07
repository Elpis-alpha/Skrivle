"use client";

// Claiming a guest board on sign-in.
//
// The OAuth callback does NOT claim — it only carries the board id through to
// the redirect as ?claim=<id>. Performing the claim is the front-end's job,
// because the creatorToken lives in this browser's localStorage and nowhere
// else. back-end/src/http/routes/auth.ts

import { claimBoard } from "@/lib/api/boards";
import { isApiError } from "@/lib/api/errors";
import type { Board } from "@/lib/api/types";
import { creatorTokenFor, forgetCreatorToken } from "./creator-tokens";

/**
 * Claims a board if this browser holds its creator token. Returns null when
 * there is nothing to do — never throws for the ordinary "can't claim" cases,
 * so callers can fire it after any sign-in without guarding.
 */
export async function claimIfPossible(
  boardId: string | null | undefined,
): Promise<Board | null> {
  if (!boardId) return null;

  const creatorToken = creatorTokenFor(boardId);
  // The endpoint validates with tokenSchema.partial(), so {} passes validation
  // and then 403s in the service. Don't send a request that cannot succeed.
  if (!creatorToken) return null;

  try {
    const board = await claimBoard(boardId, creatorToken);
    // The server wipes creatorTokenHash on a successful claim; ours is dead.
    forgetCreatorToken(boardId);
    return board;
  } catch (err) {
    // 403 is overloaded: no such board, already owned, wrong token. All three
    // mean this token is worthless — forget it and never retry.
    if (isApiError(err) && err.status === 403) {
      forgetCreatorToken(boardId);
      return null;
    }
    throw err;
  }
}
