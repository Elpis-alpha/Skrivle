"use client";

// The client root for /board/:id. Owns the metadata fetch and the states it
// can land in; the live board itself is BoardSurface.
//
// The fetch is client-side on purpose. The session cookie is host-only on the
// API origin with no `domain` attribute, so a server component on Cloudflare
// never sees it and would compute `role: null` for everyone, owners included.
// (In local dev the cookie WOULD be readable — same host, different port —
// which is exactly the trap: it would work here and break after deploy.)

import { useEffect, useRef } from "react";
import {
  BoardExpired,
  BoardNotFound,
  BoardSkeleton,
  BoardUnreachable,
} from "@/components/board/BoardStates";
import { BoardSurface } from "@/components/board/BoardSurface";
import { getBoard } from "@/lib/api/boards";
import { useAuthLanding } from "@/lib/auth/landing";
import { claimIfPossible } from "@/lib/board/claim";
import { forgetCreatorToken } from "@/lib/board/creator-tokens";
import { useResource } from "@/lib/hooks/useResource";
import { useSession } from "@/lib/session/SessionProvider";

export function BoardClient({ id }: { id: string }) {
  const board = useResource(id, (signal) => getBoard(id, signal));
  const { user } = useSession();
  const landing = useAuthLanding();
  const claimed = useRef(false);

  // Landed back from a sign-in that carried ?claim=. The server records the
  // intent but never performs the claim — the creator token is in this
  // browser's localStorage and nowhere else.
  const claimId = landing.claim;
  const reload = board.reload;
  const clearLanding = landing.clear;

  useEffect(() => {
    if (!claimId || !user || claimed.current) return;
    claimed.current = true;
    void claimIfPossible(claimId)
      .then((claimedBoard) => {
        if (claimedBoard) reload();
      })
      .finally(clearLanding);
  }, [claimId, user, reload, clearLanding]);

  // An expired board's token can't buy anything; stop carrying it around.
  useEffect(() => {
    if (board.status === "error" && board.error.status === 410) {
      forgetCreatorToken(id);
    }
  }, [board.status, board.error, id]);

  if (board.status === "loading" || board.status === "idle") {
    return <BoardSkeleton />;
  }

  if (board.status === "error") {
    if (board.error.status === 404) return <BoardNotFound id={id} />;
    if (board.error.status === 410) return <BoardExpired />;
    return (
      <BoardUnreachable
        message={board.error.message}
        next={board.error.next}
        onRetry={board.reload}
      />
    );
  }

  return <BoardSurface board={board.data} onBoardChange={board.set} />;
}
