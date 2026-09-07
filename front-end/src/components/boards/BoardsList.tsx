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
import { useResource } from "@/lib/hooks/useResource";
import { useSession } from "@/lib/session/SessionProvider";

function Tile({ board }: { board: BoardSummary }) {
  return (
    <Link
      href={`/board/${board.id}`}
      className="group flex flex-col overflow-hidden rounded-md border border-border bg-surface transition-shadow duration-(--dur-fast) ease-standard hover:shadow-elev-2 focus-visible:focus-ring"
    >
      <div className="dot-grid relative aspect-4/3 border-b border-border bg-canvas">
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
      <div className="flex items-baseline gap-2 px-3 py-2">
        <span className="truncate text-sm font-medium text-ink">{board.title}</span>
        {board.role === "owner" ? null : (
          <span className="shrink-0 text-2xs text-ink-muted">shared</span>
        )}
      </div>
    </Link>
  );
}

function Skeletons() {
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-4" aria-busy>
      {[0, 1, 2].map((i) => (
        <div key={i} className="aspect-4/3 animate-pulse rounded-md bg-wg-100" />
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
