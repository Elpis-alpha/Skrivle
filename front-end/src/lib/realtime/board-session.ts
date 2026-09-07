// The Yjs + Socket.IO lifecycle for one board.
//
// Deliberately framework-free: every subtlety worth testing lives here — the
// two-step sync, echo suppression, ArrayBuffer unwrapping, refusal vs transport
// error, cursor throttling, retraction on teardown — and a fake socket plus two
// real Y.Docs can drive all of it. useBoardDoc is a thin binding on top.

import { io, type Socket } from "socket.io-client";
import * as Y from "yjs";
import {
  Awareness,
  applyAwarenessUpdate,
  encodeAwarenessUpdate,
  removeAwarenessStates,
} from "y-protocols/awareness";
import { API_URL } from "@/lib/api/config";
import type { CursorColor } from "@/lib/presence-colors";
import {
  EVENTS,
  HANDSHAKE_ERRORS,
  type BoardJoined,
  type HandshakeError,
  type NamedError,
} from "./events";
import { toBytes } from "./bytes";
import { claimRootTypes } from "./doc-schema";
import {
  colorByName,
  peersFrom,
  type Cursor,
  type PresencePeer,
  type PresenceState,
} from "./presence";

export type ConnectionStatus =
  | "connecting"
  | "connected"
  | "reconnecting"
  | "refused"
  | "closed";

export type Refusal = { reason: HandshakeError } & NamedError;

export type Self = {
  userId: string | null;
  name: string;
  signedIn: boolean;
  color: CursorColor;
};

export type BoardSessionState = {
  status: ConnectionStatus;
  /** True once the server's answer to our state vector has been applied (§7 settle). */
  hydrated: boolean;
  refusal: Refusal | null;
  self: Self | null;
  peers: PresencePeer[];
  lastError: NamedError | null;
};

/** Origin tag for everything that arrived from the server, so we never echo it back. */
const REMOTE = Symbol("remote");

/**
 * Origin tag for edits this user made, which is what the drawing tools transact
 * under.
 *
 * Anything that isn't REMOTE already broadcasts, so this changes nothing here —
 * it exists so the UndoManager can track *only* deliberate local edits. A bare
 * `doc.transact(fn)` gets `origin === null`, which Yjs tracks by default, so a
 * maintenance pass that forgot an origin would otherwise land on the user's undo
 * stack.
 */
export const LOCAL = Symbol("local");

/**
 * How often local state goes out on the wire — cursors here, in-progress pen
 * strokes in the drawing tools.
 *
 * Paired with the ~70ms cursor interpolation in STYLE_GUIDE §7, and deliberately
 * one number for the whole product: local rendering runs at animation rate, the
 * network never does. Socket.IO sends a binary event as two frames, so the cost
 * of publishing is dominated by message count rather than payload size.
 */
export const PUBLISH_MS = 50;

/** Movements smaller than this aren't worth a frame on the wire. */
const CURSOR_EPSILON = 0.5;

/** A handshake that wedges must not leave a permanently blank canvas. */
const HYDRATE_FALLBACK_MS = 3000;

const REFUSAL_COPY: Record<HandshakeError, NamedError> = {
  [HANDSHAKE_ERRORS.NO_BOARD]: {
    message: "This board couldn't be opened.",
    next: "Go back and open the board from its link.",
  },
  [HANDSHAKE_ERRORS.NOT_FOUND]: {
    message: "That board doesn't exist yet.",
    next: "Check the link, or create a board from the home page.",
  },
  [HANDSHAKE_ERRORS.EXPIRED]: {
    message: "This board has expired.",
    next: "Guest boards last 24 hours. Start a new board to keep going.",
  },
  [HANDSHAKE_ERRORS.FAILED]: {
    message: "Couldn't join this board.",
    next: "Refresh the page to try again.",
  },
};

function refusalFor(raw: string): Refusal {
  const reason = (Object.values(HANDSHAKE_ERRORS) as string[]).includes(raw)
    ? (raw as HandshakeError)
    : HANDSHAKE_ERRORS.FAILED;
  return { reason, ...REFUSAL_COPY[reason] };
}

export type BoardSession = {
  doc: Y.Doc;
  awareness: Awareness;
  subscribe: (listener: () => void) => () => void;
  getSnapshot: () => BoardSessionState;
  /** Publish the local cursor in board coordinates. Throttled internally. */
  setCursor: (point: { x: number; y: number } | null) => void;
  destroy: () => void;
};

export type CreateBoardSessionOptions = {
  boardId: string;
  /** Must be non-empty — the server's "Guest" fallback never fires for "". */
  name: string;
  avatarUrl?: string | null;
  /** Injectable so tests can drive a fake socket. */
  connect?: (boardId: string, name: string) => Socket;
};

function defaultConnect(boardId: string, name: string): Socket {
  return io(API_URL, {
    path: "/socket.io",
    // The session cookie rides the handshake; without this the server sees a
    // guest even when you're signed in.
    withCredentials: true,
    // The board is chosen here, for the socket's whole lifetime.
    auth: { boardId, name },
    // Listeners must be attached before connecting — see below.
    autoConnect: false,
  });
}

export function createBoardSession(
  options: CreateBoardSessionOptions,
): BoardSession {
  const { boardId, name, avatarUrl = null } = options;
  const connect = options.connect ?? defaultConnect;

  const doc = new Y.Doc();
  // Before any applyUpdate can define them for us.
  claimRootTypes(doc);

  const awareness = new Awareness(doc);
  const localState: PresenceState = {
    name,
    color: null,
    signedIn: false,
    avatarUrl,
    cursor: null,
  };
  awareness.setLocalState(localState);

  let state: BoardSessionState = {
    status: "connecting",
    hydrated: false,
    refusal: null,
    self: null,
    peers: [],
    lastError: null,
  };

  const listeners = new Set<() => void>();
  let destroyed = false;

  // useSyncExternalStore compares snapshots by identity, so this must be a
  // cached object replaced only when something actually changed. Returning a
  // fresh literal every call spins React forever.
  function emit(patch: Partial<BoardSessionState>): void {
    if (destroyed) return;
    state = { ...state, ...patch };
    for (const listener of listeners) listener();
  }

  function refreshPeers(): void {
    emit({ peers: peersFrom(awareness.getStates(), doc.clientID) });
  }

  const socket = connect(boardId, name);

  // --- local -> wire --------------------------------------------------------

  const onDocUpdate = (update: Uint8Array, origin: unknown) => {
    // Never bounce back what the server just sent us.
    if (origin === REMOTE) return;
    socket.emit(EVENTS.SYNC_UPDATE, update);
  };
  doc.on("update", onDocUpdate);

  const onAwarenessUpdate = (
    {
      added,
      updated,
      removed,
    }: { added: number[]; updated: number[]; removed: number[] },
    origin: unknown,
  ) => {
    refreshPeers();
    if (origin === REMOTE) return;
    const changed = [...added, ...updated, ...removed];
    if (changed.length === 0) return;
    // This also relays y-protocols' own periodic re-announce, which is what
    // heals a peer that was wrongly retracted.
    socket.emit(
      EVENTS.AWARENESS_UPDATE,
      encodeAwarenessUpdate(awareness, changed),
    );
  };
  awareness.on("update", onAwarenessUpdate);

  // --- wire -> local --------------------------------------------------------

  let hydrateTimer: ReturnType<typeof setTimeout> | null = null;

  function markHydrated(): void {
    if (hydrateTimer) {
      clearTimeout(hydrateTimer);
      hydrateTimer = null;
    }
    if (!state.hydrated) emit({ hydrated: true });
  }

  socket.on("connect", () => emit({ status: "connected" }));

  socket.on(EVENTS.BOARD_JOINED, (payload: BoardJoined) => {
    const color = colorByName(payload.color?.name ?? null, doc.clientID);

    emit({
      status: "connected",
      refusal: null,
      self: {
        userId: payload.you?.id ?? null,
        name: payload.you?.name || name,
        signedIn: payload.you?.signedIn === true,
        color,
      },
    });

    // The colour is per-connection and can change on reconnect, so republish
    // rather than caching it anywhere durable.
    awareness.setLocalState({
      ...(awareness.getLocalState() as PresenceState),
      name: payload.you?.name || name,
      color: payload.color?.name ?? null,
      signedIn: payload.you?.signedIn === true,
      avatarUrl,
    } satisfies PresenceState);

    // Our half of the two-step: tell the server what we already have.
    socket.emit(EVENTS.SYNC_STEP, Y.encodeStateVector(doc));

    if (!hydrateTimer && !state.hydrated) {
      hydrateTimer = setTimeout(markHydrated, HYDRATE_FALLBACK_MS);
    }
  });

  socket.on(EVENTS.SYNC_STEP, (payload: unknown) => {
    const vector = toBytes(payload);
    if (!vector) return;
    socket.emit(EVENTS.SYNC_UPDATE, Y.encodeStateAsUpdate(doc, vector));
  });

  socket.on(EVENTS.SYNC_UPDATE, (payload: unknown) => {
    const update = toBytes(payload);
    if (!update) return;
    Y.applyUpdate(doc, update, REMOTE);
    markHydrated();
  });

  socket.on(EVENTS.AWARENESS_UPDATE, (payload: unknown) => {
    const update = toBytes(payload);
    if (!update) return;
    applyAwarenessUpdate(awareness, update, REMOTE);
  });

  socket.on(EVENTS.ERROR, (payload: NamedError) => emit({ lastError: payload }));

  socket.on("connect_error", (err: Error) => {
    // `active` is the discriminator, not the message: a CONNECT_ERROR packet
    // (our middleware refusing the handshake) destroys the manager, so there
    // will be no retry. An engine-level blip leaves it active and retrying.
    if (socket.active) {
      emit({ status: "reconnecting" });
      return;
    }
    emit({ status: "refused", refusal: refusalFor(err.message) });
  });

  socket.on("disconnect", (reason: string) => {
    emit({
      status: reason === "io client disconnect" ? "closed" : "reconnecting",
    });
  });

  socket.connect();

  // --- local cursor ---------------------------------------------------------

  let pending: { x: number; y: number } | null = null;
  let hasPending = false;
  let published: { x: number; y: number } | null = null;
  let flushTimer: ReturnType<typeof setTimeout> | null = null;

  function publish(point: { x: number; y: number } | null): void {
    published = point;
    const cursor: Cursor | null = point
      ? { x: point.x, y: point.y, t: Date.now() }
      : null;
    awareness.setLocalStateField("cursor", cursor);
  }

  function flush(): void {
    flushTimer = null;
    if (!hasPending) return;
    hasPending = false;
    publish(pending);
    // Keep the window open so a continuous drag stays throttled rather than
    // firing immediately on the next move.
    flushTimer = setTimeout(flush, PUBLISH_MS);
  }

  function setCursor(point: { x: number; y: number } | null): void {
    if (destroyed) return;

    if (
      point &&
      published &&
      Math.abs(point.x - published.x) < CURSOR_EPSILON &&
      Math.abs(point.y - published.y) < CURSOR_EPSILON
    ) {
      return;
    }

    pending = point;
    hasPending = true;

    if (flushTimer === null) {
      // Leading edge: the first move of a gesture goes out immediately.
      hasPending = false;
      publish(point);
      flushTimer = setTimeout(flush, PUBLISH_MS);
    }
  }

  // --- teardown -------------------------------------------------------------

  function destroy(): void {
    if (destroyed) return;
    destroyed = true;

    if (flushTimer) clearTimeout(flushTimer);
    if (hydrateTimer) clearTimeout(hydrateTimer);

    // Retract our own cursor before the socket goes: peers lose it a round trip
    // early. The server's own retraction still covers a crash or a lost tab.
    try {
      removeAwarenessStates(awareness, [doc.clientID], "local");
    } catch {
      // Awareness already torn down; nothing to retract.
    }

    doc.off("update", onDocUpdate);
    awareness.off("update", onAwarenessUpdate);
    socket.removeAllListeners();
    socket.disconnect();
    awareness.destroy();
    doc.destroy();
    listeners.clear();
  }

  return {
    doc,
    awareness,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getSnapshot: () => state,
    setCursor,
    destroy,
  };
}
