"use client";

// The primary action on every marketing surface. Creates a board server-side
// and routes to it. Ids are minted and collision-checked by the API
// (docs/ARCHITECTURE.md#board-identity), never by this button.

import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { Button, type ButtonSize } from "@/components/ui/Button";
import { createBoard } from "@/lib/api/boards";
import { isApiError } from "@/lib/api/errors";
import { rememberCreatorToken } from "@/lib/board/creator-tokens";

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

  async function create() {
    if (pending) return;
    setPending(true);
    setError(null);

    try {
      const board = await createBoard();

      // Signed out, this token arrives exactly once and is the only handle for
      // extending or claiming the board later. Store it before navigating.
      if (board.creatorToken) {
        rememberCreatorToken(board.id, board.creatorToken, board.title);
      }

      onNavigate?.();
      // The push unmounts this button, so `pending` is left running — the
      // spinner covers the navigation rather than flashing back to idle.
      router.push(`/board/${board.id}`);
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
      <Button
        variant="primary"
        size={size}
        className={className}
        loading={pending}
        onClick={() => void create()}
      >
        {children}
      </Button>
      {error ? (
        <p role="alert" className="mt-2 text-xs text-danger">
          {error}
        </p>
      ) : null}
    </>
  );
}
