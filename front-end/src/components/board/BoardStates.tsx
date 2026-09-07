"use client";

// STYLE_GUIDE.md §10.21 — the states a board URL can land in. Each names the
// way out; none apologises.

import { useRouter } from "next/navigation";
import { useState } from "react";
import { PageShell } from "@/components/site/PageShell";
import { Button } from "@/components/ui/Button";
import { createBoard } from "@/lib/api/boards";
import { isApiError } from "@/lib/api/errors";
import { rememberCreatorToken } from "@/lib/board/creator-tokens";

/** Loading a board is a full-screen skeleton, not a centred spinner (§10.20). */
export function BoardSkeleton() {
  return (
    <div className="flex h-dvh flex-col bg-canvas" aria-busy>
      <div className="flex h-14 shrink-0 items-center gap-3 border-b border-border bg-surface px-4">
        <div className="h-4 w-20 animate-pulse rounded-sm bg-wg-100" />
        <div className="h-4 w-32 animate-pulse rounded-sm bg-wg-100" />
        <div className="ml-auto h-6 w-24 animate-pulse rounded-pill bg-wg-100" />
      </div>
      <div className="dot-grid flex-1" />
      <span className="sr-only">Loading board…</span>
    </div>
  );
}

function StateCard({
  title,
  body,
  children,
}: {
  title: string;
  body: string;
  children?: React.ReactNode;
}) {
  return (
    <PageShell>
      <h1 className="text-lg text-ink">{title}</h1>
      <p className="mt-2 text-base text-ink-secondary">{body}</p>
      <div className="mt-6 flex flex-wrap gap-3">{children}</div>
    </PageShell>
  );
}

/**
 * A board id nobody has taken. Offering to create it is the point — the id in
 * the URL is a perfectly good custom id.
 */
export function BoardNotFound({ id }: { id: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create() {
    setPending(true);
    setError(null);
    try {
      const board = await createBoard({ customId: id });
      if (board.creatorToken) {
        rememberCreatorToken(board.id, board.creatorToken, board.title);
      }
      // Same URL, now with a board behind it.
      router.refresh();
      router.replace(`/board/${board.id}`);
    } catch (err) {
      setPending(false);
      setError(
        isApiError(err) && err.status === 409
          ? "Someone just took that id. Try a different one."
          : isApiError(err)
            ? `${err.message} ${err.next}`
            : "Couldn't create that board. Try again in a moment.",
      );
    }
  }

  return (
    <StateCard
      title="That board doesn't exist yet."
      body="Nobody has taken this address. You can create it and start drawing."
    >
      <Button variant="primary" size="sm" loading={pending} onClick={() => void create()}>
        Create board &ldquo;{id}&rdquo;
      </Button>
      <Button href="/" variant="ghost" size="sm">
        Back to home
      </Button>
      {error ? (
        <p role="alert" className="w-full text-xs text-danger">
          {error}
        </p>
      ) : null}
    </StateCard>
  );
}

/**
 * Guest boards last 24 hours. Deliberately no "Extend" here even when this
 * browser holds the creator token: extendBoard doesn't check expiry, so it
 * would work until the sweep runs and fail after — a coin-flip action is worse
 * than none.
 */
export function BoardExpired() {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function startFresh() {
    setPending(true);
    try {
      const board = await createBoard();
      if (board.creatorToken) {
        rememberCreatorToken(board.id, board.creatorToken, board.title);
      }
      router.replace(`/board/${board.id}`);
    } catch {
      setPending(false);
    }
  }

  return (
    <StateCard
      title="This board has expired."
      body="Guest boards last 24 hours. Sign in first and your next board is kept for good."
    >
      <Button variant="primary" size="sm" loading={pending} onClick={() => void startFresh()}>
        Start a new board
      </Button>
      <Button href="/signin" variant="secondary" size="sm">
        Sign in
      </Button>
    </StateCard>
  );
}

/** The id never had a chance — decided without a round trip. */
export function BoardIdInvalid({ reason }: { reason: string }) {
  return (
    <StateCard title="That isn't a board id" body={reason}>
      <Button href="/" variant="primary" size="sm">
        Back to home
      </Button>
    </StateCard>
  );
}

export function BoardUnreachable({
  message,
  next,
  onRetry,
}: {
  message: string;
  next: string;
  onRetry: () => void;
}) {
  return (
    <StateCard title={message} body={next}>
      <Button variant="primary" size="sm" onClick={onRetry}>
        Try again
      </Button>
      <Button href="/" variant="ghost" size="sm">
        Back to home
      </Button>
    </StateCard>
  );
}
