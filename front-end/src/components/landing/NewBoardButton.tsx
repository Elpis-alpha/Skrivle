"use client";

// The primary action on every marketing surface. Creates a board server-side
// and routes to it. Ids are minted and collision-checked by the API
// (docs/ARCHITECTURE.md#board-identity), never by this button.
//
// A chevron split off the main button (STYLE_GUIDE §10.2) opens
// CreateBoardDialog for the "choose my own id and title" path — the main
// click keeps working exactly as before, unmodified.

import { ChevronDown } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { Button, type ButtonSize } from "@/components/ui/Button";
import { CreateBoardDialog } from "@/components/landing/CreateBoardDialog";
import { createBoard } from "@/lib/api/boards";
import { isApiError } from "@/lib/api/errors";
import type { CreatedBoard } from "@/lib/api/types";
import { rememberCreatorToken } from "@/lib/board/creator-tokens";

// The chevron's own height is pinned to its paired Button size (h-8/h-10/h-12)
// so the pair reads as one control; its width follows the icon-button scale
// (STYLE_GUIDE §10.2 — 32/36/40px) rather than the wider primary button.
const CHEVRON: Record<ButtonSize, string> = {
  sm: "h-8 w-8",
  md: "h-10 w-9",
  lg: "h-12 w-10",
};

export function NewBoardButton({
  children,
  size = "md",
  className,
  onNavigate,
}: {
  children: ReactNode;
  size?: ButtonSize;
  className?: string;
  onNavigate?: () => void;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  // Shared by the one-click path and the dialog's submit: store the one-time
  // creatorToken before the push unmounts everything that could keep it, then
  // navigate.
  function finish(board: CreatedBoard) {
    if (board.creatorToken) {
      rememberCreatorToken(board.id, board.creatorToken, board.title);
    }
    onNavigate?.();
    router.push(`/board/${board.id}`);
  }

  async function create() {
    if (pending) return;
    setPending(true);
    setError(null);

    try {
      finish(await createBoard());
      // The push unmounts this button, so `pending` is left running — the
      // spinner covers the navigation rather than flashing back to idle.
    } catch (err) {
      // Unlike the old client-side mint, this can fail: rate limits, an API
      // that's down. Stop the spinner or the CTA spins forever.
      setPending(false);
      setError(
        isApiError(err)
          ? `${err.message} ${err.next}`
          : "Couldn't start a board. Try again in a moment.",
      );
    }
  }

  return (
    <>
      <div className={`inline-flex ${className ?? ""}`}>
        <Button
          variant="primary"
          size={size}
          className="rounded-r-none"
          loading={pending}
          onClick={() => void create()}
        >
          {children}
        </Button>
        <button
          type="button"
          onClick={() => setDialogOpen(true)}
          disabled={pending}
          aria-label="Choose a board id and title"
          aria-haspopup="dialog"
          aria-expanded={dialogOpen}
          className={
            "inline-flex shrink-0 items-center justify-center rounded-l-none rounded-r-md " +
            "border-l border-accent-on/25 bg-accent text-accent-on transition-colors " +
            "duration-(--dur-fast) ease-standard hover:bg-accent-hover active:bg-accent-active " +
            "focus-visible:focus-ring disabled:cursor-not-allowed disabled:bg-accent-200 " +
            CHEVRON[size]
          }
        >
          <ChevronDown size={16} strokeWidth={1.75} aria-hidden="true" />
        </button>
      </div>
      {error ? (
        <p role="alert" className="mt-2 text-xs text-danger">
          {error}
        </p>
      ) : null}
      <CreateBoardDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onCreated={finish}
      />
    </>
  );
}
