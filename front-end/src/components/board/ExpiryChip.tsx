"use client";

// STYLE_GUIDE.md §4.2 — the amber chip a guest board carries in its top bar.

import { useEffect, useState } from "react";
import { Plus, LogIn } from "lucide-react";
import { useMounted } from "@/components/motion/useMounted";
import { extendBoard } from "@/lib/api/boards";
import { isApiError } from "@/lib/api/errors";
import type { BoardWithRole } from "@/lib/api/types";
import { creatorTokenFor, forgetCreatorToken } from "@/lib/board/creator-tokens";
import { formatRemaining } from "@/lib/board/expiry";

const CHIP =
  "shrink-0 rounded-pill bg-warning-subtle px-2 py-0.5 text-2xs font-medium text-warning-strong";

export function ExpiryChip({
  board,
  onExtended,
}: {
  board: BoardWithRole;
  onExtended: (expiresAt: string) => void;
}) {
  const [pending, setPending] = useState(false);
  // Set when the server tells us the token is dead; see extend() below.
  const [tokenRejected, setTokenRejected] = useState(false);
  // A bare re-render trigger, not the clock itself. Holding the timestamp in
  // state would let it go stale between ticks, and a stale `now` rounds the
  // remaining time *up* — telling someone their board has 48h left when it has
  // 47h and change.
  const [, tick] = useState(0);
  const mounted = useMounted();

  const expiresAt = board.expiresAt;

  useEffect(() => {
    // Minute resolution matches the copy; seconds would be wrong more often
    // than right.
    const timer = setInterval(() => tick((n) => n + 1), 60_000);
    return () => clearInterval(timer);
  }, []);

  if (!board.isEphemeral || !expiresAt) return null;

  const label = formatRemaining(expiresAt);
  // localStorage is a client-only fact, so it can't be read until after
  // hydration without risking a mismatch.
  const canExtend = mounted && !tokenRejected && creatorTokenFor(board.id) !== null;

  async function extend() {
    const creatorToken = creatorTokenFor(board.id);
    if (!creatorToken || pending) return;

    setPending(true);
    try {
      const { expiresAt: extended } = await extendBoard(board.id, creatorToken);
      onExtended(extended);
    } catch (err) {
      // 403 means this token is worthless — drop the affordance rather than
      // offering an action that will keep failing.
      if (isApiError(err) && err.status === 403) {
        forgetCreatorToken(board.id);
        setTokenRejected(true);
      }
    } finally {
      setPending(false);
    }
  }

  // Below sm, "Expires in " is dropped: the pill's shape and warning colour
  // already say "this is a countdown," and the top bar has no width to spare
  // (see BoardSurface.tsx and the min-w on its title). formatRemaining() stays
  // untouched — its own tests pin the full copy — this only trims it for
  // display.
  const shortLabel = label.replace(/^Expires(?: in)?\s*/, "");

  return (
    <span className={CHIP}>
      <span className="tabular-nums">
        <span className="hidden sm:inline">{label}</span>
        <span className="sm:hidden">{shortLabel}</span>
      </span>
      {canExtend ? (
        <>
          {/* Below sm this collapses to an icon: the top bar has no width to
              spare once a title, an avatar cluster, and "My boards" are all
              fighting for the same row (see BoardSurface.tsx), and "Extend"
              spelled out was the easiest 60-90px to give back without hiding
              anything that isn't reachable another way. */}
          <span className="hidden sm:inline"> · </span>
          <button
            type="button"
            onClick={() => void extend()}
            disabled={pending}
            aria-label={pending ? "Extending" : "Extend"}
            className="rounded-sm underline decoration-warning-strong/40 underline-offset-2 hover:decoration-warning-strong focus-visible:focus-ring disabled:no-underline"
          >
            <Plus size={12} strokeWidth={2} className="sm:hidden" aria-hidden="true" />
            <span className="hidden sm:inline">{pending ? "Extending…" : "Extend"}</span>
          </button>
        </>
      ) : (
        <>
          {/* No creator token in this browser, so Extend would 403. Offer the
              thing that actually works instead — full text on a normal-width
              screen; below sm this is dropped rather than shrunk, since the
              header's own Sign-in button already does the same thing. */}
          <span className="hidden sm:inline"> · </span>
          <a
            href={`/signin?next=/board/${board.id}`}
            aria-label="Sign in to keep it"
            className="rounded-sm underline decoration-warning-strong/40 underline-offset-2 hover:decoration-warning-strong focus-visible:focus-ring"
          >
            <LogIn size={12} strokeWidth={2} className="sm:hidden" aria-hidden="true" />
            <span className="hidden sm:inline">Sign in to keep it</span>
          </a>
        </>
      )}
    </span>
  );
}
