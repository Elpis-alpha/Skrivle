"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import type * as Y from "yjs";
import type { Awareness } from "y-protocols/awareness";
import {
  createBoardSession,
  type BoardSession,
  type BoardSessionState,
} from "./board-session";

export type BoardDoc = BoardSessionState & {
  doc: Y.Doc | null;
  awareness: Awareness | null;
  setCursor: (point: { x: number; y: number } | null) => void;
};

const IDLE: BoardDoc = {
  status: "connecting",
  hydrated: false,
  refusal: null,
  self: null,
  peers: [],
  lastError: null,
  doc: null,
  awareness: null,
  setCursor: () => {},
};

/**
 * A stable store that owns whichever session is current.
 *
 * The session itself can't be created during render — it opens a socket — but
 * putting it in state would mean React re-subscribing on every swap, and a
 * synchronous setState inside an effect. One long-lived holder avoids both:
 * `subscribe` and `getSnapshot` keep the same identity for the hook's whole
 * life, and only the snapshot behind them changes.
 */
function createSessionHolder() {
  let session: BoardSession | null = null;
  let snapshot: BoardDoc = IDLE;
  const listeners = new Set<() => void>();

  const notify = () => {
    for (const listener of listeners) listener();
  };

  // useSyncExternalStore compares snapshots by identity, so this must be
  // rebuilt only when something actually changed — never per call.
  const refresh = () => {
    snapshot = session
      ? {
          ...session.getSnapshot(),
          doc: session.doc,
          awareness: session.awareness,
          setCursor: session.setCursor,
        }
      : IDLE;
    notify();
  };

  return {
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getSnapshot: () => snapshot,
    getServerSnapshot: () => IDLE,
    open(options: { boardId: string; name: string; avatarUrl: string | null }) {
      session?.destroy();
      session = createBoardSession(options);
      session.subscribe(refresh);
      refresh();
    },
    close() {
      session?.destroy();
      session = null;
      refresh();
    },
  };
}

/**
 * Connects to a board and keeps a local Yjs replica in sync.
 *
 * All the lifecycle lives in createBoardSession; this only binds it to React.
 *
 * @param boardId null while the board's metadata is still loading, or when it
 * turned out not to be joinable — the socket is never opened in that case.
 * @param name must be non-empty. See lib/board/guest-name.ts.
 */
export function useBoardDoc({
  boardId,
  name,
  avatarUrl = null,
}: {
  boardId: string | null;
  name: string;
  avatarUrl?: string | null;
}): BoardDoc {
  const [holder] = useState(createSessionHolder);

  useEffect(() => {
    if (!boardId) return;

    holder.open({ boardId, name, avatarUrl });

    // StrictMode mounts twice in dev. The teardown is complete, and the next
    // open builds a brand-new Y.Doc — hence a new clientID — which sidesteps
    // the stale-retraction race entirely: the first mount's retraction names a
    // client id the second no longer uses. The visible cost is two joins, so
    // your peer-visible colour advances by one in dev. Don't "optimise" this by
    // reusing the doc across mounts; that reintroduces the race.
    return () => holder.close();
  }, [holder, boardId, name, avatarUrl]);

  const state = useSyncExternalStore(
    holder.subscribe,
    holder.getSnapshot,
    holder.getServerSnapshot,
  );

  const setCursor = useCallback(
    (point: { x: number; y: number } | null) =>
      holder.getSnapshot().setCursor(point),
    [holder],
  );

  return { ...state, setCursor };
}
