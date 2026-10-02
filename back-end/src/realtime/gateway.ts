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
  releaseClients,
  SERVER_ORIGIN,
} from "./awareness.js";
import { acquireDoc, releaseDoc, socketCount, trackSocket, untrackSocket } from "./doc-manager.js";
import {
  MAX_AWARENESS_BYTES,
  newBucket,
  RESYNC_AFTER_MS,
  SOCKET_RULES,
  take,
  type Bucket,
} from "./limits.js";
import { persistSnapshot } from "./snapshot-writer.js";
import { dropLogs } from "./update-log.js";
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
import { reportError } from "../errors/report.js";
import { colorForJoinOrder } from "../presence/cursor-colors.js";
import { EVENTS } from "../protocol/events.js";

export { roomFor };

/**
 * The least time between two notices of one kind to one socket. A pen stroke
 * on a full board is twenty refusals a second, and each notice is a toast
 * someone has to dismiss.
 */
const NOTICE_EVERY_MS = 10_000;

/** Boards whose awareness already has the listener that broadcasts retractions. */
const broadcasting = new WeakSet<object>();

/** Set by attachGateway, for the REST layer's evictBoard. */
let server: IOServer | null = null;

/** Per-socket state, established during the handshake. */
type SocketState = {
  /** The socket's own id, which is what awareness knows it by. */
  id: string;
  boardId: string;
  userId: string | null;
  displayName: string;
  joinOrder: number;
  /** What lets this client's next socket carry on as the same cursor. */
  presenceKey: string;
  /** Awareness client ids this socket speaks for, released on disconnect. */
  awarenessClients: Set<number>;
  buckets: { syncUpdate: Bucket; syncBytes: Bucket; syncStep: Bucket; awareness: Bucket };
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
  server = io;

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
        id: socket.id,
        boardId: board.id,
        userId: user?.id ?? null,
        displayName: user?.name ?? guestName ?? "Guest",
        joinOrder: nextJoinOrder(board.id),
        presenceKey: presenceKeyFrom(socket),
        awarenessClients: new Set(),
        buckets: {
          syncUpdate: newBucket(SOCKET_RULES.syncUpdate),
          syncBytes: newBucket(SOCKET_RULES.syncBytes),
          syncStep: newBucket(SOCKET_RULES.syncStep),
          awareness: newBucket(SOCKET_RULES.awareness),
        },
      });
      next();
    } catch (err) {
      reportError("socket-handshake", err);
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
    reportError("board-load", err, { boardId });
    named(socket, "This board's canvas couldn't be loaded.", "Refresh in a moment; the work is still saved.");
    socket.disconnect(true);
    return;
  }

  // Between the await above and here the socket may already be gone. It never
  // joined the room, so no disconnect handler will release what it loaded.
  if (socket.disconnected) {
    if (socketCount(boardId) === 0) void releaseBoard(boardId);
    return;
  }

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

    // An update dropped for arriving too fast leaves a hole: Yjs holds back
    // everything that client sends afterwards until the missing piece turns
    // up. So a drop is followed, once the bucket has refilled, by the server
    // advertising what it has — which the client answers with all of what it
    // lacks, the same exchange as on join.
    let resync: NodeJS.Timeout | null = null;
    const resyncSoon = () => {
      if (resync) return;
      resync = setTimeout(() => {
        resync = null;
        sendInitialSync(socket, doc);
      }, RESYNC_AFTER_MS);
    };

    const told = new Map<string, number>();
    const notice = (kind: string, message: string, next: string) => {
      const now = Date.now();
      if (now - (told.get(kind) ?? -Infinity) < NOTICE_EVERY_MS) return;
      told.set(kind, now);
      named(socket, message, next);
    };

    // Set when the board was too full to take something this socket sent. The
    // client still has it, and everything it sends afterwards leans on it, so
    // once anything of its gets in again it is asked for what is missing.
    let refusedForRoom = false;

    socket.on(EVENTS.SYNC_STEP, (payload: unknown) => {
      const vector = toBytes(payload);
      if (!vector) return;
      if (!take(own.buckets.syncStep, SOCKET_RULES.syncStep)) return;
      sendMissingUpdates(socket, doc, vector);
    });

    socket.on(EVENTS.SYNC_UPDATE, (payload: unknown) => {
      const update = toBytes(payload);
      if (!update) return;
      if (
        !take(own.buckets.syncUpdate, SOCKET_RULES.syncUpdate) ||
        !take(own.buckets.syncBytes, SOCKET_RULES.syncBytes, update.byteLength)
      ) {
        resyncSoon();
        return;
      }

      const { status, behind } = applyClientUpdate(io, boardId, doc, update, socket);
      if (status === "too_large") {
        notice("too_large", "That change was too large to apply.", "Try again with a smaller selection.");
      } else if (status === "board_full") {
        refusedForRoom = true;
        notice("board_full", "This board is full.", "Delete something to make room, or start a new board.");
      } else if (status === "applied" && refusedForRoom) {
        refusedForRoom = false;
        resyncSoon();
      }
      if (behind) resyncSoon();
    });

    // --- awareness (ephemeral, never persisted) ---

    socket.on(EVENTS.AWARENESS_UPDATE, (payload: unknown) => {
      const update = toBytes(payload);
      if (!update || update.byteLength > MAX_AWARENESS_BYTES) return;
      // Dropped outright when over the limit: the next one carries the whole
      // state again, so there is nothing to catch up on.
      if (!take(own.buckets.awareness, SOCKET_RULES.awareness)) return;

      let allowed: Uint8Array | null;
      try {
        allowed = applyClientAwareness(boardId, update, own);
      } catch {
        return;
      }
      if (allowed) socket.to(roomFor(boardId)).emit(EVENTS.AWARENESS_UPDATE, allowed);
    });

    // Retractions the server itself makes (a peer disconnecting) still have to
    // reach everyone, so they are broadcast from here rather than relayed. One
    // listener per board, not per socket: each would send the same retraction
    // to the whole room.
    if (!broadcasting.has(awareness)) {
      broadcasting.add(awareness);
      awareness.on(
        "update",
        (
          { added, updated, removed }: { added: number[]; updated: number[]; removed: number[] },
          origin: unknown,
        ) => {
          if (origin !== SERVER_ORIGIN) return;
          const changed = [...added, ...updated, ...removed];
          if (changed.length === 0) return;
          io.to(roomFor(boardId)).emit(EVENTS.AWARENESS_UPDATE, encodeStates(awareness, changed));
        },
      );
    }

    socket.on("disconnect", () => {
      try {
        if (resync) clearTimeout(resync);
        // The fix for ghost cursors: the server retracts what this socket
        // brought, whether or not the client managed to say goodbye.
        releaseClients(boardId, own);

        const roomEmpty = untrackSocket(boardId, socket.id);
        if (roomEmpty) void releaseBoard(boardId);
      } catch (err) {
        reportError("socket-disconnect", err, { boardId });
      }
    });
  } catch (err) {
    reportError("board-join", err, { boardId });
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
    reportError("board-release", err, { boardId });
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
    reportError("board-release", err, { boardId, step: "cleanup" });
  }
}

/**
 * Close a board that has just been deleted: everyone off it, and nothing of it
 * left in memory or in the update log.
 *
 * Without this the people still on it keep drawing into a doc whose every
 * snapshot fails, which is never released, and whose log outlives the board —
 * to be replayed into the next board given the same id.
 *
 * The doc goes first, so the disconnects that follow find nothing to save.
 */
export async function evictBoard(boardId: string): Promise<void> {
  try {
    releaseDoc(boardId);
    releaseAwareness(boardId);
    joinCounters.delete(boardId);
    server?.in(roomFor(boardId)).disconnectSockets(true);
  } catch (err) {
    reportError("board-evict", err, { boardId });
  }
  await dropLogs([boardId]);
}

/** STYLE_GUIDE §10.3 — what happened, and the next step. */
function named(socket: Socket, message: string, next: string): void {
  socket.emit(EVENTS.ERROR, { message, next });
}

/**
 * The client's presence key, or the socket's own id for a client that sends
 * none — unique to this socket, so its client ids are simply never shared.
 */
function presenceKeyFrom(socket: Socket): string {
  const raw = socket.handshake.auth?.presenceKey;
  return typeof raw === "string" && raw.length >= 16 && raw.length <= 64 ? raw : socket.id;
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
