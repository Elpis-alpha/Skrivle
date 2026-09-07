"use client";

// STYLE_GUIDE.md §4.2 — full-bleed canvas, chrome floating over it. Nothing
// docks or takes layout width from the canvas.
//
// The drawing tools land on top of this: the Yjs doc below is already live and
// synced, so a tool only has to read and write doc-schema's root types.

import { useCallback, useRef } from "react";
import Link from "next/link";
import { AvatarCluster } from "@/components/board/AvatarCluster";
import { ConnectionBar } from "@/components/board/ConnectionBar";
import { ExpiryChip } from "@/components/board/ExpiryChip";
import { PresenceLayer } from "@/components/board/PresenceLayer";
import { BoardExpired, BoardNotFound } from "@/components/board/BoardStates";
import { Button } from "@/components/ui/Button";
import type { BoardWithRole } from "@/lib/api/types";
import { displayNameFor } from "@/lib/board/guest-name";
import { screenToBoard } from "@/lib/board/viewport";
import { useBoardDoc } from "@/lib/realtime/useBoardDoc";
import { useSession } from "@/lib/session/SessionProvider";

export function BoardSurface({
  board,
  onBoardChange,
}: {
  board: BoardWithRole;
  onBoardChange: (board: BoardWithRole) => void;
}) {
  const { user } = useSession();
  const canvasRef = useRef<HTMLDivElement>(null);

  // Never empty: the gateway's `user?.name ?? guestName ?? "Guest"` can't fall
  // through to "Guest", because guestName defaults to "" — which isn't nullish.
  //
  // Computed rather than held in state: this component only renders once the
  // metadata fetch has resolved, so it never takes part in hydration and
  // reading localStorage here is safe.
  const name = displayNameFor(user);

  const { status, hydrated, refusal, self, peers, setCursor } = useBoardDoc({
    boardId: board.id,
    name,
    avatarUrl: user?.avatarUrl ?? null,
  });

  const onPointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const bounds = canvasRef.current?.getBoundingClientRect();
      if (!bounds) return;
      setCursor(
        screenToBoard({
          x: event.clientX - bounds.left,
          y: event.clientY - bounds.top,
        }),
      );
    },
    [setCursor],
  );

  // A board that vanished while we were looking at it. The REST fetch already
  // covered the load-time cases; this catches expiry mid-session.
  if (refusal?.reason === "board_expired") return <BoardExpired />;
  if (refusal?.reason === "board_not_found") return <BoardNotFound id={board.id} />;

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-canvas">
      {/* §10.12 top bar, 56px */}
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border bg-surface px-4">
        <Link
          href="/"
          className="wordmark shrink-0 rounded-sm text-md text-ink focus-visible:focus-ring"
        >
          skrivle
        </Link>
        <h1 className="truncate text-sm font-medium text-ink">{board.title}</h1>

        <ExpiryChip
          board={board}
          onExtended={(expiresAt) => onBoardChange({ ...board, expiresAt })}
        />

        <div className="ml-auto flex shrink-0 items-center gap-3">
          <AvatarCluster self={self} peers={peers} />
          {user ? (
            <Button href="/boards" variant="ghost" size="sm">
              My boards
            </Button>
          ) : (
            <Button href={`/signin?next=/board/${board.id}`} variant="primary" size="sm">
              Sign in
            </Button>
          )}
        </div>
      </header>

      <ConnectionBar status={status} />

      {/* §7 settle: the canvas starts flat and lifts once the doc is ready.
          This is the only non-user-triggered animation in the product.
          Reduced motion is handled globally in globals.css. */}
      <div
        ref={canvasRef}
        data-testid="board-canvas"
        data-settled={hydrated ? "true" : "false"}
        onPointerMove={onPointerMove}
        onPointerLeave={() => setCursor(null)}
        className={
          "relative flex-1 touch-none overflow-hidden transition-colors duration-200 ease-standard " +
          (hydrated ? "bg-canvas" : "bg-wg-50")
        }
      >
        <div
          className={
            "dot-grid absolute inset-0 transition-opacity duration-200 ease-standard " +
            (hydrated ? "opacity-100" : "opacity-0")
          }
          aria-hidden
        />

        <PresenceLayer peers={peers} />

        {hydrated ? (
          <p className="pointer-events-none absolute inset-x-0 bottom-8 text-center text-xs text-ink-muted">
            The drawing tools land next. Open this link in another tab to see
            live cursors.
          </p>
        ) : null}
      </div>
    </div>
  );
}
