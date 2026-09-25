"use client";

// STYLE_GUIDE.md §10.15 — the My Boards grid.
//
// Signed out this renders a sign-in prompt rather than redirecting, which is
// what lets /boards return 200 to anyone (including the e2e link crawl).

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { NewBoardButton } from "@/components/landing/NewBoardButton";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { duplicateBoard, listBoards } from "@/lib/api/boards";
import { isApiError } from "@/lib/api/errors";
import type { BoardSummary } from "@/lib/api/types";
import { useAuthLanding } from "@/lib/auth/landing";
import { claimIfPossible } from "@/lib/board/claim";
import { formatEdited } from "@/lib/board/edited";
import { useResource } from "@/lib/hooks/useResource";
import { useSession } from "@/lib/session/SessionProvider";
import { DeleteBoardDialog, RenameBoardDialog } from "./BoardDialogs";
import { TileMenu } from "./TileMenu";

type TileActions = {
  onRename: (board: BoardSummary) => void;
  onDuplicate: (board: BoardSummary) => void;
  onDelete: (board: BoardSummary) => void;
};

function Tile({ board, actions }: { board: BoardSummary; actions: TileActions }) {
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
        {/* Clear of the menu button, which sits over this row's right end. */}
        <div className="flex flex-col gap-0.5 py-2 pl-3 pr-11">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-medium text-ink">{board.title}</span>
            <span className="shrink-0 rounded-pill bg-wg-100 px-1.5 py-px text-2xs text-ink-secondary">
              {board.role}
            </span>
          </div>
          <span className="text-xs text-ink-muted">{formatEdited(board.updatedAt)}</span>
        </div>
      </Link>
      {/* Beside the link rather than in it: a button inside a link is two
          controls in one, and pressing it would open the board as well. */}
      <div className="absolute bottom-2.5 right-1.5">
        <TileMenu
          title={board.title}
          owner={board.role === "owner"}
          onRename={() => actions.onRename(board)}
          onDuplicate={() => actions.onDuplicate(board)}
          onDelete={() => actions.onDelete(board)}
        />
      </div>
    </div>
  );
}

/** The dialog a tile's menu opened, kept through its exit so it can fade out. */
type Asking = { kind: "rename" | "delete"; board: BoardSummary; open: boolean; opened: number };

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
  const toast = useToast();
  const claimed = useRef(false);

  const boards = useResource(user ? `boards:${user.id}` : null, (signal) =>
    listBoards(signal),
  );
  const { update } = boards;

  const [asking, setAsking] = useState<Asking | null>(null);
  const ask = (kind: Asking["kind"], board: BoardSummary) =>
    setAsking((last) => ({ kind, board, open: true, opened: (last?.opened ?? 0) + 1 }));
  const stopAsking = () => setAsking((last) => last && { ...last, open: false });

  const replace = (id: string, change: (board: BoardSummary) => BoardSummary | null) =>
    update((data) => ({
      boards: data.boards.flatMap((board) => {
        if (board.id !== id) return [board];
        const changed = change(board);
        return changed ? [changed] : [];
      }),
    }));

  // No dialog: nothing is lost, and the copy lands at the top of the list,
  // where the newest edit goes.
  const duplicate = async (board: BoardSummary) => {
    try {
      const copy = await duplicateBoard(board.id);
      update((data) => ({
        boards: [
          {
            id: copy.id,
            title: copy.title,
            updatedAt: copy.updatedAt,
            role: "owner",
            thumbnailUrl: copy.thumbnailUrl,
          },
          ...data.boards,
        ],
      }));
      toast.show(`Duplicated as “${copy.title}”`, { tone: "success" });
    } catch (err) {
      toast.show(
        isApiError(err) ? `${err.message} ${err.next}`.trim() : "Couldn't duplicate the board.",
        { tone: "error" },
      );
    }
  };

  const actions: TileActions = {
    onRename: (board) => ask("rename", board),
    onDuplicate: (board) => void duplicate(board),
    onDelete: (board) => ask("delete", board),
  };

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

  const target = asking?.board ?? null;

  return (
    <>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-4">
        {boards.data.boards.map((board) => (
          <Tile key={board.id} board={board} actions={actions} />
        ))}
      </div>

      {/* Remounted for each opening, so a draft or an error never carries
          over from the last board. */}
      <RenameBoardDialog
        key={`rename-${asking?.opened ?? 0}`}
        open={asking?.kind === "rename" && asking.open}
        board={asking?.kind === "rename" ? target : null}
        onClose={stopAsking}
        onRenamed={(title) => {
          if (target) replace(target.id, (board) => ({ ...board, title }));
          toast.show("Title saved", { tone: "success" });
        }}
      />
      <DeleteBoardDialog
        key={`delete-${asking?.opened ?? 0}`}
        open={asking?.kind === "delete" && asking.open}
        board={asking?.kind === "delete" ? target : null}
        onClose={stopAsking}
        onDeleted={() => {
          if (target) replace(target.id, () => null);
          toast.show("Board deleted", { tone: "success" });
        }}
      />
    </>
  );
}
