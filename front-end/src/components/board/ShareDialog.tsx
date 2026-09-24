"use client";

// STYLE_GUIDE.md §10.13 — share dialog.
//
// "A read-only URL field + Copy link button (→ toast Link copied). One line:
// Anyone with this link can edit. For guests, a divider then: Sign in to keep
// this board after it expires. + an email field and, below an or divider,
// Continue with GitHub / Continue with Google."
//
// The link IS the product (PROJECT_BRIEF: share in one link), so this is the
// board's one primary action.

import { Suspense, useId, useRef } from "react";
import { SignInForm } from "@/components/auth/SignInForm";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { useToast } from "@/components/ui/Toast";

/** The board's shareable address, on whatever origin this page is served from. */
export const boardUrl = (boardId: string) => `${window.location.origin}/board/${boardId}`;

/**
 * Copies a board's link and says how that went. Shared with the empty-board
 * hint, which offers the same action.
 */
export function useCopyBoardLink(boardId: string, onFailure?: () => void) {
  const toast = useToast();
  return async () => {
    try {
      await navigator.clipboard.writeText(boardUrl(boardId));
      toast.show("Link copied", { tone: "success" });
    } catch {
      // Denied permission, an insecure origin, an old browser — the link is
      // still right there to copy by hand.
      toast.show("Couldn't copy the link. Select it and copy it instead.", { tone: "error" });
      onFailure?.();
    }
  };
}

export function ShareDialog({
  open,
  onClose,
  boardId,
  guest,
}: {
  open: boolean;
  onClose: () => void;
  boardId: string;
  /** Nobody signed in: the board will expire unless someone claims it. */
  guest: boolean;
}) {
  const fieldId = useId();
  const fieldRef = useRef<HTMLInputElement>(null);
  const copy = useCopyBoardLink(boardId, () => fieldRef.current?.select());

  return (
    <Dialog open={open} onClose={onClose} title="Share this board">
      <label htmlFor={fieldId} className="sr-only">
        Board link
      </label>
      <div className="mt-4 flex gap-2">
        <input
          ref={fieldRef}
          id={fieldId}
          readOnly
          value={open ? boardUrl(boardId) : ""}
          onFocus={(event) => event.currentTarget.select()}
          className={
            "h-10 min-w-0 flex-1 rounded-sm border border-border bg-surface px-3 text-sm text-ink " +
            "outline-none transition-shadow duration-(--dur-fast) ease-standard " +
            "focus:border-accent focus:shadow-[0_0_0_3px_var(--accent-subtle)]"
          }
        />
        <Button type="button" variant="primary" size="md" onClick={() => void copy()} autoFocus>
          Copy link
        </Button>
      </div>
      <p className="mt-3 text-sm text-ink-secondary">Anyone with this link can edit.</p>

      {guest ? (
        <div className="mt-6 border-t border-border pt-6">
          <p className="text-sm text-ink">Sign in to keep this board after it expires.</p>
          {/* SignInForm reads ?next= through useSearchParams, which wants a
              Suspense boundary above it. */}
          <Suspense fallback={null}>
            <SignInForm next={`/board/${boardId}`} claim={boardId} />
          </Suspense>
        </div>
      ) : null}
    </Dialog>
  );
}
