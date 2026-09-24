"use client";

// STYLE_GUIDE.md §10.12 — the board title, "inline-editable for owners (click →
// input, Enter/blur saves, toast Title saved)".
//
// Owner only because the server is: PATCH /api/boards/:id refuses anyone else,
// and offering an edit that can only fail would be worse than not offering it.
// Anyone with the link may draw; renaming is management (CLAUDE.md).

import { useId, useRef, useState } from "react";
import { renameBoard } from "@/lib/api/boards";
import { isApiError } from "@/lib/api/errors";
import type { BoardWithRole } from "@/lib/api/types";
import { useToast } from "@/components/ui/Toast";

/** The server's limit (back-end renameSchema). */
const TITLE_MAX = 120;

const TEXT = "truncate text-sm font-medium text-ink";

export function BoardTitle({
  board,
  onRenamed,
}: {
  board: BoardWithRole;
  onRenamed: (board: BoardWithRole) => void;
}) {
  const toast = useToast();
  const fieldId = useId();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(board.title);
  // What to show while a rename is in flight: the new title, optimistically,
  // until the server either agrees or says why not.
  const [pending, setPending] = useState<string | null>(null);
  // Enter and Escape both unmount the field, and a blur can follow; this makes
  // sure only the first of them counts.
  const settled = useRef(false);

  const shown = pending ?? board.title;

  if (board.role !== "owner") {
    return <h1 className={`min-w-12 flex-1 ${TEXT}`}>{board.title}</h1>;
  }

  const open = () => {
    settled.current = false;
    setDraft(shown);
    setEditing(true);
  };

  const cancel = () => {
    if (settled.current) return;
    settled.current = true;
    setEditing(false);
  };

  const save = async () => {
    if (settled.current) return;
    settled.current = true;
    setEditing(false);

    const title = draft.trim();
    if (!title || title === shown) return;

    setPending(title);
    try {
      const saved = await renameBoard(board.id, title);
      onRenamed({ ...board, title: saved.title });
      toast.show("Title saved", { tone: "success" });
    } catch (err) {
      toast.show(
        isApiError(err) ? `${err.message} ${err.next}`.trim() : "Couldn't rename the board.",
        { tone: "error" },
      );
    } finally {
      setPending(null);
    }
  };

  return (
    <h1 className="flex min-w-12 flex-1">
      {editing ? (
        <>
          <label htmlFor={fieldId} className="sr-only">
            Board title
          </label>
          <input
            id={fieldId}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onFocus={(event) => event.currentTarget.select()}
            onBlur={() => void save()}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                void save();
              } else if (event.key === "Escape") {
                event.preventDefault();
                cancel();
              }
            }}
            maxLength={TITLE_MAX}
            autoFocus
            autoComplete="off"
            className={
              "-mx-1.5 h-8 w-full max-w-80 rounded-sm border border-accent bg-surface px-1.5 " +
              "text-sm font-medium text-ink outline-none shadow-[0_0_0_3px_var(--accent-subtle)]"
            }
          />
        </>
      ) : (
        <button
          type="button"
          onClick={open}
          aria-label={`Rename board: ${shown}`}
          title="Rename"
          className={
            `-mx-1.5 max-w-full rounded-sm px-1.5 py-1 text-left ${TEXT} ` +
            "transition-colors duration-(--dur-fast) ease-standard hover:bg-wg-50 focus-visible:focus-ring"
          }
        >
          {shown}
        </button>
      )}
    </h1>
  );
}
