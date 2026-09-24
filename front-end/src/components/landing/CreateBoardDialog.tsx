"use client";

// STYLE_GUIDE.md §10.16 (dialog base) + §10.4 (board-id field) + §10.3 (text
// field). The one-click NewBoardButton path skips all of this; this is the
// "choose your own id and title" option behind its chevron.

import { Check, Loader2, X } from "lucide-react";
import { useId, useRef, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { checkBoardIdAvailable, createBoard } from "@/lib/api/boards";
import { isApiError } from "@/lib/api/errors";
import type { CreatedBoard } from "@/lib/api/types";
import { isValidCustomId } from "@/lib/board-id";

const ID_MAX = 32;
const TITLE_MAX = 120;

const FIELD_BASE =
  "mt-2 h-10 w-full rounded-sm border bg-surface px-3 text-base text-ink " +
  "outline-none transition-shadow duration-(--dur-fast) ease-standard " +
  "placeholder:text-ink-muted focus:shadow-[0_0_0_3px_var(--accent-subtle)]";

type Availability = "idle" | "checking" | "available" | "taken" | "invalid";

type Problem = { message: string; next?: string };

function problemFrom(err: unknown): Problem {
  if (isApiError(err)) return { message: err.message, next: err.next };
  return {
    message: "Couldn't create the board.",
    next: "Try again in a moment.",
  };
}

export function CreateBoardDialog({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  /** The caller owns what happens next — storing a creatorToken, navigating. */
  onCreated: (board: CreatedBoard) => void;
}) {
  const idFieldId = useId();
  const titleFieldId = useId();
  const problemId = useId();

  const idInputRef = useRef<HTMLInputElement>(null);
  const checkGeneration = useRef(0);

  const [customId, setCustomId] = useState("");
  const [title, setTitle] = useState("");
  const [availability, setAvailability] = useState<Availability>("idle");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<Problem | null>(null);

  // Fresh every time the dialog opens — this is a one-shot creation form, not
  // a draft worth preserving between visits. Adjusted during render (the
  // useResource.ts pattern) rather than in an effect, so there is no extra
  // render between "opened" and "form cleared".
  const [openedFor, setOpenedFor] = useState(open);
  if (open !== openedFor) {
    setOpenedFor(open);
    if (open) {
      setCustomId("");
      setTitle("");
      setAvailability("idle");
      setBusy(false);
      setProblem(null);
    }
  }

  // Checked on blur, never per keystroke — GET .../available is rate-limited
  // at 60/min. A generation counter discards a stale reply if the field
  // changed (or was re-blurred) before the previous check landed.
  async function checkId(raw: string) {
    const id = raw.trim();
    if (!id) {
      setAvailability("idle");
      return;
    }
    if (!isValidCustomId(id)) {
      setAvailability("invalid");
      return;
    }

    const generation = ++checkGeneration.current;
    setAvailability("checking");
    try {
      const { available } = await checkBoardIdAvailable(id);
      if (checkGeneration.current !== generation) return;
      setAvailability(available ? "available" : "taken");
    } catch {
      if (checkGeneration.current !== generation) return;
      // The check is an early hint, not the authority — creation re-validates
      // server-side, so a failed probe just falls back to "we'll find out".
      setAvailability("idle");
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy || availability === "checking" || availability === "invalid")
      return;

    const id = customId.trim();
    if (availability === "taken") {
      idInputRef.current?.focus();
      return;
    }

    setBusy(true);
    setProblem(null);
    try {
      const board = await createBoard({
        ...(id ? { customId: id } : {}),
        ...(title.trim() ? { title: title.trim() } : {}),
      });
      onCreated(board);
      onClose();
    } catch (err) {
      // 409 means someone took this id between the blur check and submit —
      // point at the field rather than the generic error line, same copy the
      // server already wrote for exactly this (§10.3: name the fix).
      if (isApiError(err) && err.status === 409 && id) {
        setAvailability("taken");
        setProblem({ message: err.message, next: err.next });
        idInputRef.current?.focus();
      } else {
        setProblem(problemFrom(err));
      }
    } finally {
      setBusy(false);
    }
  }

  const idInvalid = availability === "taken" || availability === "invalid";
  const idHint =
    availability === "invalid"
      ? "3–32 letters, numbers, or hyphens."
      : availability === "taken"
        ? "That id is already taken."
        : "Leave blank and we'll generate one.";

  // §10.16's shell — portal, scrim, focus trap and return, scroll lock — is
  // Dialog's. The portal matters here in particular: NewBoardButton is used
  // inside SiteHeader, whose backdrop-blur would otherwise capture the scrim.
  return (
    <Dialog open={open} onClose={onClose} title="Create a board">
      <form
        onSubmit={(event) => void submit(event)}
        noValidate
        className="mt-4"
      >
        <label
          htmlFor={idFieldId}
          className="text-sm font-medium text-ink"
        >
          Board id
        </label>
        <div
          className={
            "mt-2 flex h-10 items-center overflow-hidden rounded-sm border bg-surface " +
            "transition-shadow duration-(--dur-fast) ease-standard focus-within:shadow-[0_0_0_3px_var(--accent-subtle)] " +
            (idInvalid
              ? "border-danger focus-within:border-danger"
              : "border-border focus-within:border-accent")
          }
        >
          <span className="shrink-0 whitespace-nowrap pl-3 text-sm text-ink-muted">
            {typeof window !== "undefined" ? window.location.origin : ""}
            /board/
          </span>
          <input
            ref={idInputRef}
            id={idFieldId}
            value={customId}
            onChange={(event) => {
              checkGeneration.current++; // stale in-flight checks no longer apply
              setCustomId(event.target.value);
              setAvailability("idle");
              if (problem) setProblem(null);
            }}
            onBlur={(event) => void checkId(event.target.value)}
            maxLength={ID_MAX}
            autoFocus
            autoComplete="off"
            spellCheck={false}
            placeholder="generated for you"
            aria-invalid={idInvalid || undefined}
            aria-describedby={`${idFieldId}-hint`}
            className="h-full min-w-0 flex-1 bg-transparent pr-2 text-base text-ink outline-none placeholder:text-ink-muted"
          />
          <span
            className="flex shrink-0 items-center pr-3"
            aria-hidden="true"
          >
            {availability === "checking" ? (
              <Loader2
                size={16}
                strokeWidth={2}
                className="animate-spin text-ink-muted"
              />
            ) : availability === "available" ? (
              <Check size={16} strokeWidth={2} className="text-success" />
            ) : availability === "taken" ? (
              <X size={16} strokeWidth={2} className="text-danger" />
            ) : null}
          </span>
        </div>
        <p
          id={`${idFieldId}-hint`}
          className={
            "mt-2 text-xs " +
            (idInvalid ? "text-danger" : "text-ink-muted")
          }
        >
          {idHint}
        </p>

        <label
          htmlFor={titleFieldId}
          className="mt-4 block text-sm font-medium text-ink"
        >
          Title{" "}
          <span className="font-normal text-ink-muted">(optional)</span>
        </label>
        <input
          id={titleFieldId}
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          maxLength={TITLE_MAX}
          placeholder="Untitled board"
          className={FIELD_BASE + " border-border focus:border-accent"}
        />

        {problem ? (
          <p
            id={problemId}
            role="alert"
            className="mt-4 text-xs text-danger"
          >
            {problem.message}
            {problem.next ? (
              <span className="text-ink-muted"> {problem.next}</span>
            ) : null}
          </p>
        ) : null}

        <div className="mt-6 flex justify-end gap-3">
          <Button type="button" variant="ghost" size="md" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="submit"
            variant="primary"
            size="md"
            loading={busy}
            disabled={availability === "checking" || idInvalid}
          >
            Create board
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
