"use client";

// STYLE_GUIDE.md §10.21 — the empty board.
//
// A new board is otherwise a blank grid, and the first seconds on it decide
// whether someone draws anything. So: the two fastest ways in, and the link,
// because drawing together is the point (PROJECT_BRIEF).
//
// It never gets in the way. The text lets presses through to the canvas, so
// drawing straight across it works; only the button is chrome. It is gone the
// moment anything lands on the board — from anyone, not just from you.

import type * as Y from "yjs";
import { Button } from "@/components/ui/Button";
import { CHROME_ATTR } from "@/lib/board/useBoardGestures";
import { useElementIds } from "@/lib/realtime/useElements";
import { useCopyBoardLink } from "./ShareDialog";

const KEY =
  "mx-0.5 rounded-sm border border-border bg-surface px-1.5 py-0.5 font-sans text-xs text-ink";

export function EmptyBoardHint({
  doc,
  hydrated,
  boardId,
}: {
  doc: Y.Doc | null;
  /** Before the document arrives, empty means "not loaded yet". */
  hydrated: boolean;
  boardId: string;
}) {
  const ids = useElementIds(doc);
  const copy = useCopyBoardLink(boardId);

  if (!hydrated || ids.length > 0) return null;

  return (
    <div className="pointer-events-none absolute inset-0 grid place-items-center p-6">
      <div className="board-settle-in flex max-w-sm flex-col items-center gap-3 text-center">
        <p className="text-md font-medium text-ink">This board is empty.</p>
        <p className="text-sm text-ink-secondary">
          {/* Keys mean nothing on a phone; the toolbar is right there instead. */}
          <span className="pointer-coarse:hidden">
            Press <kbd className={KEY}>N</kbd> for a note or <kbd className={KEY}>P</kbd> to
            draw
          </span>
          <span className="hidden pointer-coarse:inline">Pick a tool below to start</span>
          {" — or share the link and draw together."}
        </p>
        <div {...{ [CHROME_ATTR]: "" }} className="pointer-events-auto">
          <Button variant="secondary" size="sm" onClick={() => void copy()}>
            Copy link
          </Button>
        </div>
      </div>
    </div>
  );
}
