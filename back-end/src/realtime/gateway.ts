// Socket.IO gateway — docs/ARCHITECTURE.md#real-time-sync-model.
//
// Authorization stance, stated plainly because it is easy to get backwards:
// **anyone holding the link may edit a board's canvas.** That is the product —
// PROJECT_BRIEF.md's "share via URL, anyone with the link joins as a guest" and
// the 5-second demo both depend on it. So the check here is only "does this
// board exist, and is it still alive". Roles gate *management* (rename, delete,
// extend, claim), which lives in the REST layer, not here.
//
// What the handshake does establish is *identity*, so cursors can carry a name
// and My Boards can record activity.
import type { Server as HttpServer } from "node:http";
import { Server as IOServer, type Socket } from "socket.io";
import {
  applyClientAwareness,
  awarenessFor,
  encodeAllStates,
  encodeStates,
  releaseAwareness,
  retractClients,
  SERVER_ORIGIN,
} from "./awareness.js";
import { acquireDoc, releaseDoc, socketCount, trackSocket, untrackSocket } from "./doc-manager.js";
import { persistSnapshot } from "./snapshot-writer.js";
import {
  applyClientUpdate,
  MAX_FRAME_BYTES,
  roomFor,
  sendInitialSync,
  sendMissingUpdates,
  toBytes,
} from "./yjs-bridge.js";
import { readSession, SESSION_COOKIE } from "../auth/session.js";
import { findBoardLifecycle, isExpired, touchCollaborator } from "../boards/service.js";
import { normalizeBoardId } from "../boards/board-id.js";
import { config } from "../config/env.js";
import { prisma } from "../db/prisma.js";
import { colorForJoinOrder } from "../presence/cursor-colors.js";
import { EVENTS } from "../protocol/events.js";

export { roomFor };

/** Per-socket state, established during the handshake. */
type SocketState = {
  boardId: string;
  userId: string | null;
  displayName: string;
  joinOrder: number;
  /** Awareness client ids this socket introduced, retracted on disconnect. */
  awarenessClients: Set<number>;
};

const state = new WeakMap<Socket, SocketState>();

/** How many people have ever joined a board this process lifetime — colour index. */
const joinCounters = new Map<string, number>();

function nextJoinOrder(boardId: string): number {
  const next = joinCounters.get(boardId) ?? 0;
  joinCounters.set(boardId, next + 1);
  return next;
}

export function attachGateway(httpServer: HttpServer): IOServer {
  const io = new IOServer(httpServer, {
    path: "/socket.io",
    cors: { origin: config.corsOrigins, credentials: true },
    // The transport ceiling sits above the per-update one on purpose, so an
    // oversized edit is refused by applyClientUpdate with a message the client
    // can show, rather than having its connection torn down without one. See
    // MAX_FRAME_BYTES.
    maxHttpBufferSize: MAX_FRAME_BYTES,
  });

  // Authentication and authorization happen once, here, before any event
  // handler is wired up. The scaffold read the board id from a client-sent
  // event, which meant a socket could silently hop between boards.
  io.use(async (socket, next) => {
    try {
      const rawBoardId = socket.handshake.auth?.boardId;
      if (typeof rawBoardId !== "string" || !rawBoardId) {
        next(new Error("no_board"));
        return;
      }
      const boardId = normalizeBoardId(rawBoardId);

      const board = await findBoardLifecycle(boardId);
      if (!board) {
        next(new Error("board_not_found"));
        return;
      }
      if (isExpired(board)) {
        next(new Error("board_expired"));
        return;
      }

      const session = await readSession(sessionCookieFrom(socket));
      const user = session
        ? await prisma.user.findUnique({
            where: { id: session.userId },
            select: { id: true, name: true },
          })
        : null;

      const guestName = typeof socket.handshake.auth?.name === "string"
        ? socket.handshake.auth.name.trim().slice(0, 40)
        : "";

      state.set(socket, {
        boardId: board.id,
        userId: user?.id ?? null,
        displayName: user?.name ?? guestName ?? "Guest",
        joinOrder: nextJoinOrder(board.id),
        awarenessClients: new Set(),
      });
      next();
    } catch (err) {
      console.error("[skrivle] socket handshake failed:", err);
      next(new Error("handshake_failed"));
    }
  });

  io.on("connection", (socket) => {
    const own = state.get(socket);
    if (!own) {
      socket.disconnect(true);
      return;
    }

    void joinBoard(io, socket, own);
  });

  return io;
}

async function joinBoard(io: IOServer, socket: Socket, own: SocketState): Promise<void> {
  const { boardId } = own;

  let doc: Awaited<ReturnType<typeof acquireDoc>>;
  try {
    doc = await acquireDoc(boardId);
  } catch (err) {
    // A board whose stored document will not load must not be served as a blank
    // canvas — that would let the first edit overwrite it with nothing.
    console.error(`[skrivle] could not load board ${boardId}:`, err);
    named(socket, "This board's canvas couldn't be loaded.", "Refresh in a moment; the work is still saved.");
    socket.disconnect(true);
    return;
  }

  // Between the await above and here the socket may already be gone.
  if (socket.disconnected) return;

  // acquireDoc succeeded, so the doc is now held open for this socket — from
  // here on, any throw has to still reach a disconnect (and, via `named`, tell
  // the client why) rather than becoming an unhandled rejection off the `void
  // joinBoard(...)` call site above.
  try {
    await socket.join(roomFor(boardId));
    trackSocket(boardId, socket.id);

    const awareness = awarenessFor(boardId, doc);

    socket.emit(EVENTS.BOARD_JOINED, {
      boardId,
      // Assigned server-side: only the server knows the join order, which is
      // what front-end/src/lib/presence-colors.ts indexes into.
      color: colorForJoinOrder(own.joinOrder),
      you: { id: own.userId, name: own.displayName, signedIn: own.userId !== null },
    });

    sendInitialSync(socket, doc);

    // Existing cursors, so a late joiner sees everyone already on the board.
    const present = encodeAllStates(awareness);
    if (present) socket.emit(EVENTS.AWARENESS_UPDATE, present);

    if (own.userId) void touchCollaborator(boardId, own.userId).catch(() => {});

    // --- document sync ---

    socket.on(EVENTS.SYNC_STEP, (payload: unknown) => {
      const vector = toBytes(payload);
      if (!vector) return;
      sendMissingUpdates(socket, doc, vector);
    });

    socket.on(EVENTS.SYNC_UPDATE, (payload: unknown) => {
      const update = toBytes(payload);
      if (!update) return;
      if (!applyClientUpdate(io, boardId, doc, update, socket)) {
        named(socket, "That change was too large to apply.", "Try again with a smaller selection.");
      }
    });

    // --- awareness (ephemeral, never persisted) ---

    socket.on(EVENTS.AWARENESS_UPDATE, (payload: unknown) => {
      const update = toBytes(payload);
      if (!update) return;

      try {
        const introduced = applyClientAwareness(awareness, update, socket.id);
        for (const clientId of introduced) own.awarenessClients.add(clientId);
      } catch {
        return;
      }
      socket.to(roomFor(boardId)).emit(EVENTS.AWARENESS_UPDATE, update);
    });

    // Retractions the server itself makes (a peer disconnecting) still have to
    // reach everyone, so they are broadcast from here rather than relayed.
    const onAwarenessChange = (
      { added, updated, removed }: { added: number[]; updated: number[]; removed: number[] },
      origin: unknown,
    ) => {
      if (origin !== SERVER_ORIGIN) return;
      const changed = [...added, ...updated, ...removed];
      if (changed.length === 0) return;
      io.to(roomFor(boardId)).emit(EVENTS.AWARENESS_UPDATE, encodeStates(awareness, changed));
    };
    awareness.on("update", onAwarenessChange);

    socket.on("disconnect", () => {
      try {
        awareness.off("update", onAwarenessChange);
        // The fix for ghost cursors: the server retracts what this socket
        // brought, whether or not the client managed to say goodbye.
        retractClients(awareness, [...own.awarenessClients]);

        const roomEmpty = untrackSocket(boardId, socket.id);
        if (roomEmpty) void releaseBoard(boardId);
      } catch (err) {
        console.error(`[skrivle] disconnect cleanup failed for board ${boardId}:`, err);
      }
    });
  } catch (err) {
    console.error(`[skrivle] failed to join board ${boardId}:`, err);
    named(socket, "Something went wrong joining this board.", "Refresh to try again.");
    socket.disconnect(true);
  }
}

/**
 * Last one out saves the board.
 *
 * The snapshot has to land *before* the doc leaves memory, and the room is
 * re-checked afterwards because someone may have joined during the write.
 */
async function releaseBoard(boardId: string): Promise<void> {
  try {
    await persistSnapshot(boardId);
  } catch (err) {
    console.error(`[skrivle] final snapshot for ${boardId} failed:`, err);
    // Keep the doc in memory rather than dropping unsaved work; the periodic
    // sweep will try again.
    return;
  }

  try {
    if (socketCount(boardId) > 0) return;
    releaseDoc(boardId);
    releaseAwareness(boardId);
    joinCounters.delete(boardId);
  } catch (err) {
    console.error(`[skrivle] cleanup after releasing board ${boardId} failed:`, err);
  }
}

/** STYLE_GUIDE §10.3 — what happened, and the next step. */
function named(socket: Socket, message: string, next: string): void {
  socket.emit(EVENTS.ERROR, { message, next });
}

function sessionCookieFrom(socket: Socket): string | undefined {
  const header = socket.handshake.headers.cookie;
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name === SESSION_COOKIE) return decodeURIComponent(rest.join("="));
  }
  return undefined;
}
