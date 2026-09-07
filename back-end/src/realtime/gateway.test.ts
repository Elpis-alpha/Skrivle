import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { io as ioClient, type Socket as ClientSocket } from "socket.io-client";
import * as Y from "yjs";
import { Awareness, encodeAwarenessUpdate } from "y-protocols/awareness";

vi.mock("../mail/transport.js", () => ({
  sendMail: vi.fn(async () => true),
  verifyMailTransport: vi.fn(async () => true),
}));

const { createServer } = await import("../server.js");
const { prisma } = await import("../db/prisma.js");
const { useRedis } = await import("../test/redis-harness.js");
const { EVENTS, HANDSHAKE_ERRORS } = await import("../protocol/events.js");
const { createBoard } = await import("../boards/service.js");
const { resetRegistry } = await import("./doc-manager.js");
const { resetAwarenessRegistry } = await import("./awareness.js");

useRedis();

const { httpServer, io } = createServer();
let port: number;

await new Promise<void>((resolve) => {
  httpServer.listen(0, () => {
    port = (httpServer.address() as { port: number }).port;
    resolve();
  });
});

const open: ClientSocket[] = [];

afterAll(async () => {
  // Order matters: httpServer.close() waits for open connections, so the
  // clients and the Socket.IO server have to go first or teardown hangs.
  for (const socket of open.splice(0)) socket.close();
  await io.close();
  await new Promise<void>((resolve) => httpServer.close(() => resolve()));
});

/** Connect a client to a board and wait for board:joined. */
function connect(boardId: string, name = "Tester"): Promise<ClientSocket> {
  return new Promise((resolve, reject) => {
    const socket = ioClient(`http://localhost:${port}`, {
      path: "/socket.io",
      auth: { boardId, name },
      transports: ["websocket"],
      forceNew: true,
    });
    open.push(socket);
    socket.on(EVENTS.BOARD_JOINED, () => resolve(socket));
    socket.on("connect_error", reject);
    setTimeout(() => reject(new Error("timed out joining board")), 4000);
  });
}

/** Wait for one event, or reject on timeout. */
function once<T>(socket: ClientSocket, event: string, ms = 3000): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timed out waiting for ${event}`)), ms);
    socket.once(event, (payload: T) => {
      clearTimeout(timer);
      resolve(payload);
    });
  });
}

async function makeBoard(): Promise<string> {
  const { board } = await createBoard({});
  return board.id;
}

beforeEach(async () => {
  for (const socket of open.splice(0)) socket.close();
  resetRegistry();
  resetAwarenessRegistry();
  await prisma.boardDoc.deleteMany();
  await prisma.board.deleteMany();
  await prisma.user.deleteMany();
});

describe("handshake", () => {
  it("refuses a connection that names no board", async () => {
    const socket = ioClient(`http://localhost:${port}`, {
      path: "/socket.io",
      transports: ["websocket"],
      forceNew: true,
    });
    open.push(socket);
    const err = await once<Error>(socket, "connect_error");
    expect(err.message).toBe(HANDSHAKE_ERRORS.NO_BOARD);
  });

  it("refuses a board that does not exist", async () => {
    const socket = ioClient(`http://localhost:${port}`, {
      path: "/socket.io",
      auth: { boardId: "nosuchboard" },
      transports: ["websocket"],
      forceNew: true,
    });
    open.push(socket);
    const err = await once<Error>(socket, "connect_error");
    expect(err.message).toBe(HANDSHAKE_ERRORS.NOT_FOUND);
  });

  it("refuses an expired board", async () => {
    const boardId = await makeBoard();
    await prisma.board.update({
      where: { id: boardId },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    const socket = ioClient(`http://localhost:${port}`, {
      path: "/socket.io",
      auth: { boardId },
      transports: ["websocket"],
      forceNew: true,
    });
    open.push(socket);
    const err = await once<Error>(socket, "connect_error");
    expect(err.message).toBe(HANDSHAKE_ERRORS.EXPIRED);
  });

  it("admits a guest — anyone with the link may edit", async () => {
    const boardId = await makeBoard();
    const socket = await connect(boardId);
    expect(socket.connected).toBe(true);
  });

  it("assigns a presence colour by join order", async () => {
    const boardId = await makeBoard();

    const first = ioClient(`http://localhost:${port}`, {
      path: "/socket.io",
      auth: { boardId },
      transports: ["websocket"],
      forceNew: true,
    });
    open.push(first);
    const firstJoin = await once<{ color: { name: string } }>(first, EVENTS.BOARD_JOINED);

    const second = ioClient(`http://localhost:${port}`, {
      path: "/socket.io",
      auth: { boardId },
      transports: ["websocket"],
      forceNew: true,
    });
    open.push(second);
    const secondJoin = await once<{ color: { name: string } }>(second, EVENTS.BOARD_JOINED);

    // Round-robin from the shared palette; two people never collide immediately.
    expect(firstJoin.color.name).toBe("coral");
    expect(secondJoin.color.name).toBe("ochre");
  });

  it("resolves the board id case-insensitively", async () => {
    const boardId = await makeBoard();
    const socket = await connect(boardId.toUpperCase());
    expect(socket.connected).toBe(true);
  });
});

describe("document sync", () => {
  it("propagates an edit from one client to another", async () => {
    const boardId = await makeBoard();
    const a = await connect(boardId, "A");
    const b = await connect(boardId, "B");

    const docA = new Y.Doc();
    const docB = new Y.Doc();

    // B applies whatever arrives.
    b.on(EVENTS.SYNC_UPDATE, (update: ArrayBuffer) => {
      Y.applyUpdate(docB, new Uint8Array(update));
    });

    const arrived = new Promise<void>((resolve) => {
      docB.on("update", () => resolve());
    });

    docA.getMap("shapes").set("rect-1", { kind: "rectangle", x: 10 });
    a.emit(EVENTS.SYNC_UPDATE, Y.encodeStateAsUpdate(docA));

    await arrived;
    expect(docB.getMap("shapes").get("rect-1")).toEqual({ kind: "rectangle", x: 10 });
  });

  it("does not echo an update back to its author", async () => {
    const boardId = await makeBoard();
    const a = await connect(boardId);

    let echoes = 0;
    a.on(EVENTS.SYNC_UPDATE, () => {
      echoes++;
    });

    const doc = new Y.Doc();
    doc.getMap("shapes").set("x", 1);
    a.emit(EVENTS.SYNC_UPDATE, Y.encodeStateAsUpdate(doc));

    await new Promise((r) => setTimeout(r, 300));
    expect(echoes).toBe(0);
  });

  it("answers a state vector with only what the client lacks", async () => {
    const boardId = await makeBoard();
    const a = await connect(boardId);

    const authored = new Y.Doc();
    authored.getMap("shapes").set("note-1", { text: "hello" });
    a.emit(EVENTS.SYNC_UPDATE, Y.encodeStateAsUpdate(authored));
    await new Promise((r) => setTimeout(r, 200));

    // A fresh client asks for everything by sending an empty state vector.
    const b = await connect(boardId);
    const empty = new Y.Doc();
    const catchUp = once<ArrayBuffer>(b, EVENTS.SYNC_UPDATE);
    b.emit(EVENTS.SYNC_STEP, Y.encodeStateVector(empty));

    Y.applyUpdate(empty, new Uint8Array(await catchUp));
    expect(empty.getMap("shapes").get("note-1")).toEqual({ text: "hello" });
  });

  it("sends its state vector on join, so a client knows what to send", async () => {
    const boardId = await makeBoard();
    const socket = ioClient(`http://localhost:${port}`, {
      path: "/socket.io",
      auth: { boardId },
      transports: ["websocket"],
      forceNew: true,
    });
    open.push(socket);

    const vector = await once<ArrayBuffer>(socket, EVENTS.SYNC_STEP);
    expect(new Uint8Array(vector).byteLength).toBeGreaterThan(0);
  });
});

describe("persistence", () => {
  it("saves the document when the last client leaves, and restores it", async () => {
    const boardId = await makeBoard();
    const a = await connect(boardId);

    const doc = new Y.Doc();
    doc.getMap("shapes").set("persisted", { text: "still here" });
    a.emit(EVENTS.SYNC_UPDATE, Y.encodeStateAsUpdate(doc));
    await new Promise((r) => setTimeout(r, 200));

    a.close();
    // Give the last-one-out snapshot time to land.
    await new Promise((r) => setTimeout(r, 500));

    const stored = await prisma.boardDoc.findUnique({ where: { boardId } });
    expect(stored).not.toBeNull();

    // Drop the in-memory doc so the next join must rehydrate from Postgres.
    resetRegistry();
    resetAwarenessRegistry();

    const b = await connect(boardId);
    const rehydrated = new Y.Doc();
    const catchUp = once<ArrayBuffer>(b, EVENTS.SYNC_UPDATE);
    b.emit(EVENTS.SYNC_STEP, Y.encodeStateVector(rehydrated));
    Y.applyUpdate(rehydrated, new Uint8Array(await catchUp));

    expect(rehydrated.getMap("shapes").get("persisted")).toEqual({ text: "still here" });
  });
});

describe("awareness", () => {
  /** Build a real awareness update the way a browser client would. */
  function awarenessUpdate(state: Record<string, unknown>): { bytes: Uint8Array; clientId: number } {
    const doc = new Y.Doc();
    const awareness = new Awareness(doc);
    awareness.setLocalState(state);
    return {
      bytes: encodeAwarenessUpdate(awareness, [doc.clientID]),
      clientId: doc.clientID,
    };
  }

  it("relays a cursor to other people on the board", async () => {
    const boardId = await makeBoard();
    const a = await connect(boardId);
    const b = await connect(boardId);

    const received = once<ArrayBuffer>(b, EVENTS.AWARENESS_UPDATE);
    a.emit(EVENTS.AWARENESS_UPDATE, awarenessUpdate({ cursor: { x: 5, y: 9 } }).bytes);

    expect(new Uint8Array(await received).byteLength).toBeGreaterThan(0);
  });

  it("retracts a departed client's cursor without needing it to say goodbye", async () => {
    // The ghost-cursor fix: the scaffold relayed awareness blindly, so a client
    // that vanished left its cursor on everyone else's canvas forever.
    const boardId = await makeBoard();
    const a = await connect(boardId);
    const b = await connect(boardId);

    const { bytes, clientId } = awarenessUpdate({ cursor: { x: 1, y: 2 } });
    await once<ArrayBuffer>(b, EVENTS.AWARENESS_UPDATE).then(() => {}).catch(() => {});
    a.emit(EVENTS.AWARENESS_UPDATE, bytes);
    await new Promise((r) => setTimeout(r, 200));

    // B should be told the cursor is gone when A disappears abruptly.
    const retraction = once<ArrayBuffer>(b, EVENTS.AWARENESS_UPDATE, 3000);
    a.disconnect();

    const decoded = new Uint8Array(await retraction);
    expect(decoded.byteLength).toBeGreaterThan(0);

    // Applying it to a fresh awareness leaves that client with no state.
    const doc = new Y.Doc();
    const awareness = new Awareness(doc);
    const { applyAwarenessUpdate } = await import("y-protocols/awareness");
    applyAwarenessUpdate(awareness, decoded, "test");
    expect(awareness.getStates().get(clientId)).toBeUndefined();
  });
});
