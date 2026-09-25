"use client";

// STYLE_GUIDE.md §10.15 — the My Boards grid.
//
// Signed out this renders a sign-in prompt rather than redirecting, which is
// what lets /boards return 200 to anyone (including the e2e link crawl).

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef } from "react";
import { NewBoardButton } from "@/components/landing/NewBoardButton";
import { Button } from "@/components/ui/Button";
import { listBoards } from "@/lib/api/boards";
import type { BoardSummary } from "@/lib/api/types";
import { useAuthLanding } from "@/lib/auth/landing";
import { claimIfPossible } from "@/lib/board/claim";
import { formatEdited } from "@/lib/board/edited";
import { useResource } from "@/lib/hooks/useResource";
import { useSession } from "@/lib/session/SessionProvider";

function Tile({ board }: { board: BoardSummary }) {
  return (
    <div className="group relative">
      <Link
        href={`/board/${board.id}`}
        className={
          "flex flex-col overflow-hidden rounded-md border border-border bg-surface shadow-elev-1 " +
          "transition-shadow duration-(--dur-fast) ease-standard group-hover:shadow-elev-2 " +
          "focus-visible:focus-ring"
        }
      >
        {/* 16:10, the crop Cloudinary delivers (media/cloudinary.ts). */}
        <div className="dot-grid relative aspect-16/10 border-b border-border bg-canvas">
          {board.thumbnailUrl ? (
            <Image
              src={board.thumbnailUrl}
              alt=""
              fill
              sizes="(max-width: 640px) 100vw, 240px"
              className="object-cover"
            />
          ) : null}
        </div>
        <div className="flex flex-col gap-0.5 px-3 py-2">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-medium text-ink">{board.title}</span>
            <span className="shrink-0 rounded-pill bg-wg-100 px-1.5 py-px text-2xs text-ink-secondary">
              {board.role}
            </span>
          </div>
          <span className="text-xs text-ink-muted">{formatEdited(board.updatedAt)}</span>
        </div>
      </Link>
    </div>
  );
}

function Skeletons() {
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-4" aria-busy>
      {[0, 1, 2].map((i) => (
        // The tile's own shape (§10.20), so the grid doesn't jump when it lands.
        <div
          key={i}
          className="flex flex-col gap-2 overflow-hidden rounded-md border border-border bg-surface pb-3"
        >
          <div className="aspect-16/10 animate-pulse bg-wg-100" />
          <div className="mx-3 h-3.5 w-2/3 animate-pulse rounded-sm bg-wg-100" />
          <div className="mx-3 h-3 w-1/3 animate-pulse rounded-sm bg-wg-100" />
        </div>
      ))}
      <span className="sr-only">Loading your boards…</span>
    </div>
  );
}

export function BoardsList() {
  const { user, status } = useSession();
  const landing = useAuthLanding();
  const claimed = useRef(false);

  const boards = useResource(user ? `boards:${user.id}` : null, (signal) =>
    listBoards(signal),
  );

  // Arriving here straight from an OAuth sign-in that carried ?claim=.
  const claimId = landing.claim;
  const reload = boards.reload;
  const clearLanding = landing.clear;

  useEffect(() => {
    if (!claimId || !user || claimed.current) return;
    claimed.current = true;
    void claimIfPossible(claimId)
      .then((board) => {
        if (board) reload();
      })
      .finally(clearLanding);
  }, [claimId, user, reload, clearLanding]);

  if (status === "loading") return <Skeletons />;

  if (!user) {
    return (
      <div className="rounded-md border border-border bg-surface p-6">
        <h2 className="text-md text-ink">Sign in to see your boards.</h2>
        <p className="mt-2 text-base text-ink-secondary">
          Boards you make while signed in are kept for good and listed here.
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <Button href="/signin?next=/boards" variant="primary" size="sm">
            Sign in
          </Button>
          <NewBoardButton size="sm">New board</NewBoardButton>
        </div>
      </div>
    );
  }

  if (boards.status === "loading" || boards.status === "idle") return <Skeletons />;

  if (boards.status === "error") {
    return (
      <div className="rounded-md border border-border bg-surface p-6">
        <h2 className="text-md text-ink">{boards.error.message}</h2>
        <p className="mt-2 text-base text-ink-secondary">{boards.error.next}</p>
        <div className="mt-4">
          <Button variant="primary" size="sm" onClick={boards.reload}>
            Try again
          </Button>
        </div>
      </div>
    );
  }

  if (boards.data.boards.length === 0) {
    return (
      <div className="rounded-md border border-border bg-surface p-6">
        <h2 className="text-md text-ink">No boards yet.</h2>
        <p className="mt-2 text-base text-ink-secondary">
          Create one to get started — it&apos;ll be saved to your account.
        </p>
        <div className="mt-4">
          <NewBoardButton size="sm">New board</NewBoardButton>
        </div>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-4">
      {boards.data.boards.map((board) => (
        <Tile key={board.id} board={board} />
      ))}
    </div>
  );
}
