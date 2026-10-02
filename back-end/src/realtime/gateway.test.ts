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
const { flushTestKeys, useRedis } = await import("../test/redis-harness.js");
const { EVENTS, HANDSHAKE_ERRORS } = await import("../protocol/events.js");
const { createBoard } = await import("../boards/service.js");
const { peekDoc, resetRegistry } = await import("./doc-manager.js");
const { evictBoard } = await import("./gateway.js");
const { appendUpdate, readUpdates } = await import("./update-log.js");
const encoding = await import("lib0/encoding");
const { resetAwarenessRegistry } = await import("./awareness.js");
const { MAX_BOARD_BYTES, MAX_CLIENT_IDS_PER_SOCKET, SOCKET_RULES } = await import("./limits.js");

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
function connect(
  boardId: string,
  name = "Tester",
  auth: Record<string, unknown> = {},
): Promise<ClientSocket> {
  return new Promise((resolve, reject) => {
    const socket = ioClient(`http://localhost:${port}`, {
      path: "/socket.io",
      auth: { boardId, name, ...auth },
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
  await flushTestKeys("ulog:*");
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

  /** What a newcomer is told about who is here: client id -> state. */
  async function presentOn(boardId: string): Promise<Map<number, Record<string, unknown>>> {
    const socket = ioClient(`http://localhost:${port}`, {
      path: "/socket.io",
      auth: { boardId },
      transports: ["websocket"],
      forceNew: true,
    });
    open.push(socket);

    const { applyAwarenessUpdate } = await import("y-protocols/awareness");
    const awareness = new Awareness(new Y.Doc());
    awareness.setLocalState(null);
    socket.on(EVENTS.AWARENESS_UPDATE, (bytes: ArrayBuffer) => {
      applyAwarenessUpdate(awareness, new Uint8Array(bytes), "test");
    });
    await once(socket, EVENTS.BOARD_JOINED);
    // The present list follows board:joined; give it a moment to arrive.
    await new Promise((r) => setTimeout(r, 150));
    socket.close();
    return awareness.getStates() as Map<number, Record<string, unknown>>;
  }

  /** An update about someone else's client id — what a forger would send. */
  function forged(clientId: number, state: Record<string, unknown> | null): Uint8Array {
    const doc = new Y.Doc();
    doc.clientID = clientId;
    const awareness = new Awareness(doc);
    // Well past the real client's clock, so it would win if it were applied.
    for (let i = 0; i < 5; i++) awareness.setLocalState({ step: i });
    awareness.setLocalState(state);
    return encodeAwarenessUpdate(awareness, [clientId]);
  }

  const settle = () => new Promise((r) => setTimeout(r, 200));

  it("ignores an update about somebody else's cursor", async () => {
    const boardId = await makeBoard();
    const a = await connect(boardId);
    const b = await connect(boardId);

    const { bytes, clientId } = awarenessUpdate({ cursor: { x: 1, y: 2 } });
    a.emit(EVENTS.AWARENESS_UPDATE, bytes);
    await settle();

    b.emit(EVENTS.AWARENESS_UPDATE, forged(clientId, { cursor: { x: 999, y: 999 } }));
    await settle();

    expect((await presentOn(boardId)).get(clientId)).toEqual({ cursor: { x: 1, y: 2 } });
  });

  it("ignores a retraction of somebody else's cursor", async () => {
    const boardId = await makeBoard();
    const a = await connect(boardId);
    const b = await connect(boardId);

    const { bytes, clientId } = awarenessUpdate({ cursor: { x: 1, y: 2 } });
    a.emit(EVENTS.AWARENESS_UPDATE, bytes);
    await settle();

    b.emit(EVENTS.AWARENESS_UPDATE, forged(clientId, null));
    await settle();

    expect((await presentOn(boardId)).get(clientId)).toEqual({ cursor: { x: 1, y: 2 } });
  });

  // A client relays y-protocols' own retraction of a peer it hasn't heard
  // from. If that claimed the peer's id, the peer couldn't come back.
  it("does not let a retraction take a client id nobody holds", async () => {
    const boardId = await makeBoard();
    const a = await connect(boardId);
    const b = await connect(boardId);
    const { clientId } = awarenessUpdate({});

    b.emit(EVENTS.AWARENESS_UPDATE, forged(clientId, null));
    await settle();
    a.emit(EVENTS.AWARENESS_UPDATE, forged(clientId, { cursor: { x: 1, y: 2 } }));
    await settle();

    expect((await presentOn(boardId)).get(clientId)).toEqual({ cursor: { x: 1, y: 2 } });
  });

  // y-protocols reads a state with JSON.parse, so " null" retracts as surely
  // as "null" does. It must be recognised the same way.
  it("is not fooled by a retraction spelled another way", async () => {
    const boardId = await makeBoard();
    const a = await connect(boardId);
    const b = await connect(boardId);
    const { clientId } = awarenessUpdate({});

    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, 1);
    encoding.writeVarUint(encoder, clientId);
    encoding.writeVarUint(encoder, 1);
    encoding.writeVarString(encoder, " null ");
    b.emit(EVENTS.AWARENESS_UPDATE, encoding.toUint8Array(encoder));
    await settle();
    a.emit(EVENTS.AWARENESS_UPDATE, forged(clientId, { cursor: { x: 1, y: 2 } }));
    await settle();

    expect((await presentOn(boardId)).get(clientId)).toEqual({ cursor: { x: 1, y: 2 } });
  });

  it("tells the room once, not once per socket, when someone leaves", async () => {
    const boardId = await makeBoard();
    const a = await connect(boardId);
    const b = await connect(boardId);
    await connect(boardId);

    a.emit(EVENTS.AWARENESS_UPDATE, awarenessUpdate({ cursor: { x: 1, y: 2 } }).bytes);
    await settle();

    let heard = 0;
    b.on(EVENTS.AWARENESS_UPDATE, () => heard++);
    a.disconnect();
    await settle();

    expect(heard).toBe(1);
  });

  it("stops one socket introducing a crowd", async () => {
    const boardId = await makeBoard();
    const a = await connect(boardId);

    for (let i = 0; i < MAX_CLIENT_IDS_PER_SOCKET + 5; i++) {
      a.emit(EVENTS.AWARENESS_UPDATE, awarenessUpdate({ cursor: { x: i, y: i } }).bytes);
    }
    await settle();

    expect((await presentOn(boardId)).size).toBe(MAX_CLIENT_IDS_PER_SOCKET);
  });

  // A reconnect is a new socket, and it usually arrives before the server has
  // noticed the old one is dead.
  it("lets a client's next socket carry on with its cursor, and keeps it when the old one drops", async () => {
    const boardId = await makeBoard();
    const presenceKey = "a-presence-key-of-enough-length";
    const old = await connect(boardId, "A", { presenceKey });
    const next = await connect(boardId, "A", { presenceKey });

    const { bytes, clientId } = awarenessUpdate({ cursor: { x: 1, y: 2 } });
    old.emit(EVENTS.AWARENESS_UPDATE, bytes);
    await settle();
    next.emit(EVENTS.AWARENESS_UPDATE, forged(clientId, { cursor: { x: 3, y: 4 } }));
    await settle();
    expect((await presentOn(boardId)).get(clientId)).toEqual({ cursor: { x: 3, y: 4 } });

    old.disconnect();
    await settle();
    expect((await presentOn(boardId)).get(clientId)).toEqual({ cursor: { x: 3, y: 4 } });

    next.disconnect();
    await settle();
    expect((await presentOn(boardId)).has(clientId)).toBe(false);
  });
});

describe("limits", () => {
  /** Everything a fresh client would be sent. */
  async function boardAsSeenBy(socket: ClientSocket): Promise<Y.Doc> {
    const doc = new Y.Doc();
    const catchUp = once<ArrayBuffer>(socket, EVENTS.SYNC_UPDATE);
    socket.emit(EVENTS.SYNC_STEP, Y.encodeStateVector(doc));
    Y.applyUpdate(doc, new Uint8Array(await catchUp));
    return doc;
  }

  // Dropping an update leaves a hole that holds back everything after it, so
  // the server follows a drop by asking the client for what it is missing.
  it("drops updates that arrive too fast, then asks for them again", async () => {
    const boardId = await makeBoard();
    const a = await connect(boardId);

    const doc = new Y.Doc();
    doc.on("update", (update: Uint8Array) => a.emit(EVENTS.SYNC_UPDATE, update));
    // What board-session.ts does with the server's state vector.
    let asked = 0;
    a.on(EVENTS.SYNC_STEP, (vector: ArrayBuffer) => {
      asked++;
      a.emit(EVENTS.SYNC_UPDATE, Y.encodeStateAsUpdate(doc, new Uint8Array(vector)));
    });

    const sent = SOCKET_RULES.syncUpdate.capacity + 100;
    for (let i = 0; i < sent; i++) doc.getMap("strokes").set(`s${i}`, i);

    await expect.poll(() => asked, { timeout: 4000 }).toBeGreaterThan(0);
    await new Promise((r) => setTimeout(r, 300));

    const b = await connect(boardId);
    expect((await boardAsSeenBy(b)).getMap("strokes").size).toBe(sent);
  });

  it("answers only so many state vectors", async () => {
    const boardId = await makeBoard();
    const a = await connect(boardId);

    let answers = 0;
    a.on(EVENTS.SYNC_UPDATE, () => answers++);
    const vector = Y.encodeStateVector(new Y.Doc());
    for (let i = 0; i < SOCKET_RULES.syncStep.capacity + 20; i++) a.emit(EVENTS.SYNC_STEP, vector);
    await new Promise((r) => setTimeout(r, 400));

    expect(answers).toBe(SOCKET_RULES.syncStep.capacity);
  });

  it("refuses to grow a full board, and still lets it be cleared", async () => {
    const boardId = await makeBoard();
    const a = await connect(boardId);

    const errors: Array<{ message: string }> = [];
    a.on(EVENTS.ERROR, (err: { message: string }) => errors.push(err));

    const doc = new Y.Doc();
    doc.on("update", (update: Uint8Array) => a.emit(EVENTS.SYNC_UPDATE, update));
    a.on(EVENTS.SYNC_STEP, (vector: ArrayBuffer) => {
      a.emit(EVENTS.SYNC_UPDATE, Y.encodeStateAsUpdate(doc, new Uint8Array(vector)));
    });

    // Each a good part of a megabyte; together, past the board's ceiling.
    const chunk = "x".repeat(900_000);
    const chunks = Math.ceil(MAX_BOARD_BYTES / chunk.length);
    for (let i = 0; i < chunks; i++) doc.getMap("notes").set(`n${i}`, chunk);
    await expect.poll(() => errors.length, { timeout: 4000 }).toBe(1);
    expect(errors[0]!.message).toBe("This board is full.");

    const b = await connect(boardId);
    const full = await boardAsSeenBy(b);
    expect(full.getMap("notes").size).toBe(chunks - 1);

    // A deletion is the one thing a full board must still accept.
    doc.getMap("notes").delete("n0");
    await new Promise((r) => setTimeout(r, 300));

    const c = await connect(boardId);
    expect((await boardAsSeenBy(c)).getMap("notes").has("n0")).toBe(false);
    expect(errors).toHaveLength(1);

    // The refused note is still on its author's screen, and everything they
    // draw next leans on it. Now there is room, the server asks for it.
    const last = `n${chunks - 1}`;
    await expect
      .poll(async () => (await boardAsSeenBy(await connect(boardId))).getMap("notes").has(last), {
        timeout: 5000,
        interval: 500,
      })
      .toBe(true);
  });

  // Yjs would keep such an update, waiting for the piece it leans on — in
  // memory and in every snapshot, for ever if that piece never came.
  it("keeps nothing it cannot use, and asks the sender for what is missing", async () => {
    const boardId = await makeBoard();
    const a = await connect(boardId);

    const doc = new Y.Doc();
    const updates: Uint8Array[] = [];
    doc.on("update", (update: Uint8Array) => updates.push(update));
    doc.getMap("notes").set("first", 1);
    doc.getMap("notes").set("second", 2);

    const asked = once<ArrayBuffer>(a, EVENTS.SYNC_STEP, 4000);
    a.emit(EVENTS.SYNC_UPDATE, updates[1]);
    await new Promise((r) => setTimeout(r, 200));

    const held = peekDoc(boardId)!;
    expect(held.store.pendingStructs).toBeNull();
    expect(held.getMap("notes").size).toBe(0);

    a.emit(EVENTS.SYNC_UPDATE, Y.encodeStateAsUpdate(doc, new Uint8Array(await asked)));
    await new Promise((r) => setTimeout(r, 200));
    expect(held.getMap("notes").size).toBe(2);
  });

  it("keeps no deletions of things it has never seen", async () => {
    const boardId = await makeBoard();
    const a = await connect(boardId);

    const doc = new Y.Doc();
    doc.getMap("notes").set("gone", 1);
    const before = Y.encodeStateVector(doc);
    doc.getMap("notes").delete("gone");

    // Only the deletion: of an item the server was never sent.
    a.emit(EVENTS.SYNC_UPDATE, Y.encodeStateAsUpdate(doc, before));
    await new Promise((r) => setTimeout(r, 200));

    expect(peekDoc(boardId)!.store.pendingDs).toBeNull();
  });

  it("passes on and logs only what changed the board", async () => {
    const boardId = await makeBoard();
    const a = await connect(boardId);
    const b = await connect(boardId);

    let heard = 0;
    b.on(EVENTS.SYNC_UPDATE, () => heard++);

    const doc = new Y.Doc();
    doc.getMap("notes").set("once", 1);
    const update = Y.encodeStateAsUpdate(doc);
    for (let i = 0; i < 5; i++) a.emit(EVENTS.SYNC_UPDATE, update);
    await new Promise((r) => setTimeout(r, 300));

    expect(heard).toBe(1);
    expect(await readUpdates(boardId)).toHaveLength(1);
  });

  it("saves and passes on nothing from bytes that are not an update", async () => {
    const boardId = await makeBoard();
    const a = await connect(boardId);
    const b = await connect(boardId);

    let heard = 0;
    b.on(EVENTS.SYNC_UPDATE, () => heard++);

    const doc = new Y.Doc();
    doc.getMap("notes").set("k", "v");
    const whole = Y.encodeStateAsUpdate(doc);
    // Its structs intact, its delete set cut short.
    a.emit(EVENTS.SYNC_UPDATE, whole.slice(0, whole.byteLength - 1));
    await new Promise((r) => setTimeout(r, 300));

    expect(heard).toBe(0);
    expect(peekDoc(boardId)!.getMap("notes").size).toBe(0);
  });
});

describe("a deleted board", () => {
  it("puts everyone off it and leaves nothing behind", async () => {
    const boardId = await makeBoard();
    const a = await connect(boardId);

    const doc = new Y.Doc();
    doc.getMap("notes").set("k", "v");
    a.emit(EVENTS.SYNC_UPDATE, Y.encodeStateAsUpdate(doc));
    await new Promise((r) => setTimeout(r, 200));
    expect(await readUpdates(boardId)).toHaveLength(1);

    const dropped = once<string>(a, "disconnect");
    await prisma.board.delete({ where: { id: boardId } });
    await evictBoard(boardId);

    expect(await dropped).toBe("io server disconnect");
    expect(peekDoc(boardId)).toBeNull();
    expect(await readUpdates(boardId)).toHaveLength(0);
  });

  // Ids are reused. The board that had this one before must not be replayed
  // into the one that has it now.
  it("does not leave a log for the next board with its id to inherit", async () => {
    const stale = new Y.Doc();
    stale.getMap("notes").set("old", "board");
    appendUpdate("standup", Y.encodeStateAsUpdate(stale));
    await new Promise((r) => setTimeout(r, 100));

    const { board } = await createBoard({ customId: "standup" });

    expect(await readUpdates(board.id)).toHaveLength(0);
  });
});
