"use client";

// The two My Boards actions that ask first (STYLE_GUIDE §10.15): a new title,
// and whether you mean it. Both on §10.16's dialog, and both keep a failure
// inside the dialog, beside what you were doing, rather than in a toast.

import { useId, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { deleteBoard, renameBoard } from "@/lib/api/boards";
import { isApiError } from "@/lib/api/errors";
import type { BoardSummary } from "@/lib/api/types";

/** Matches the API's limit (back-end/src/boards/service.ts, MAX_TITLE). */
const TITLE_MAX = 120;

const FIELD =
  "mt-2 h-10 w-full rounded-sm border border-border bg-surface px-3 text-base text-ink " +
  "outline-none transition-shadow duration-(--dur-fast) ease-standard " +
  "placeholder:text-ink-muted focus:border-accent focus:shadow-[0_0_0_3px_var(--accent-subtle)]";

type Problem = { message: string; next?: string };

function problemFrom(err: unknown, fallback: string): Problem {
  if (isApiError(err)) return { message: err.message, next: err.next };
  return { message: fallback, next: "Try again in a moment." };
}

function ProblemLine({ problem }: { problem: Problem | null }) {
  if (!problem) return null;
  return (
    <p role="alert" className="mt-4 text-xs text-danger">
      {problem.message}
      {problem.next ? <span className="text-ink-muted"> {problem.next}</span> : null}
    </p>
  );
}

export function RenameBoardDialog({
  open,
  board,
  onClose,
  onRenamed,
}: {
  open: boolean;
  board: BoardSummary | null;
  onClose: () => void;
  onRenamed: (title: string) => void;
}) {
  const fieldId = useId();
  const [title, setTitle] = useState(board?.title ?? "");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<Problem | null>(null);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const next = title.trim();
    if (!board || !next) return;
    if (next === board.title) return onClose();

    setBusy(true);
    setProblem(null);
    try {
      const saved = await renameBoard(board.id, next);
      onRenamed(saved.title);
      onClose();
    } catch (err) {
      setProblem(problemFrom(err, "Couldn't rename the board."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} title="Rename board">
      <form onSubmit={(event) => void submit(event)} noValidate className="mt-4">
        <label htmlFor={fieldId} className="text-sm font-medium text-ink">
          Title
        </label>
        <input
          id={fieldId}
          value={title}
          onChange={(event) => {
            setTitle(event.target.value);
            if (problem) setProblem(null);
          }}
          onFocus={(event) => event.currentTarget.select()}
          maxLength={TITLE_MAX}
          autoFocus
          autoComplete="off"
          className={FIELD}
        />
        <ProblemLine problem={problem} />
        <div className="mt-6 flex justify-end gap-3">
          <Button type="button" variant="ghost" size="md" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="submit"
            variant="primary"
            size="md"
            loading={busy}
            disabled={title.trim() === ""}
          >
            Save
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

export function DeleteBoardDialog({
  open,
  board,
  onClose,
  onDeleted,
}: {
  open: boolean;
  board: BoardSummary | null;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<Problem | null>(null);

  const confirm = async () => {
    if (!board) return;
    setBusy(true);
    setProblem(null);
    try {
      await deleteBoard(board.id);
      onDeleted();
      onClose();
    } catch (err) {
      setProblem(problemFrom(err, "Couldn't delete the board."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} title={`Delete “${board?.title ?? ""}”?`}>
      <p className="mt-2 text-base text-ink-secondary">
        It goes for everyone with the link, and can&apos;t be brought back.
      </p>
      <ProblemLine problem={problem} />
      <div className="mt-6 flex justify-end gap-3">
        <Button type="button" variant="ghost" size="md" onClick={onClose}>
          Cancel
        </Button>
        <Button
          type="button"
          variant="danger"
          size="md"
          loading={busy}
          onClick={() => void confirm()}
        >
          Delete board
        </Button>
      </div>
    </Dialog>
  );
}
