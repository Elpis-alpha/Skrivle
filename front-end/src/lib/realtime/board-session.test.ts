import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as Y from "yjs";
import { Awareness, encodeAwarenessUpdate } from "y-protocols/awareness";
import type { Socket } from "socket.io-client";
import { createBoardSession, type BoardSession } from "./board-session";
import { EVENTS } from "./events";

// The typed accessor in doc-schema holds Y.Maps; these tests only care that
// bytes move, so they use the raw root map and store primitives.
const elementsOf = (doc: Y.Doc) => doc.getMap("elements");

type Handler = (...args: unknown[]) => void;

/**
 * Stands in for socket.io-client. `receive` plays the server's side; `emitted`
 * records ours, so assertions are about real frames rather than mock calls.
 */
class FakeSocket {
  handlers = new Map<string, Set<Handler>>();
  emitted: Array<{ event: string; payload: unknown }> = [];
  connected = false;
  /** socket.io's refusal/transport discriminator. */
  active = true;
  disconnected = false;
  id = "fake-socket";

  on(event: string, handler: Handler) {
    if (!this.handlers.has(event)) this.handlers.set(event, new Set());
    this.handlers.get(event)!.add(handler);
    return this;
  }
  off(event: string, handler: Handler) {
    this.handlers.get(event)?.delete(handler);
    return this;
  }
  removeAllListeners() {
    this.handlers.clear();
    return this;
  }
  emit(event: string, payload?: unknown) {
    this.emitted.push({ event, payload });
    return this;
  }
  connect() {
    this.connected = true;
    return this;
  }
  disconnect() {
    this.disconnected = true;
    this.connected = false;
    return this;
  }

  /** Play a server-to-client event. */
  receive(event: string, payload?: unknown) {
    for (const handler of this.handlers.get(event) ?? []) handler(payload);
  }
  countOf(event: string) {
    return this.emitted.filter((e) => e.event === event).length;
  }
  lastOf(event: string) {
    return [...this.emitted].reverse().find((e) => e.event === event)?.payload;
  }
}

const JOINED = {
  boardId: "k3m9p",
  color: { name: "teal", base: "#1F9E8F", label: "#16736A" },
  you: { id: null, name: "Ada", signedIn: false },
};

let socket: FakeSocket;
let session: BoardSession;

function start(name = "Ada") {
  socket = new FakeSocket();
  session = createBoardSession({
    boardId: "k3m9p",
    name,
    connect: () => socket as unknown as Socket,
  });
  return session;
}

beforeEach(() => start());
afterEach(() => {
  session.destroy();
  vi.useRealTimers();
});

describe("createBoardSession", () => {
  // The server emits board:joined and sync:step the instant the connection
  // lands, and Socket.IO drops events with no listener.
  it("registers listeners before connecting", () => {
    expect(socket.handlers.has(EVENTS.BOARD_JOINED)).toBe(true);
    expect(socket.handlers.has(EVENTS.SYNC_STEP)).toBe(true);
    expect(socket.handlers.has(EVENTS.SYNC_UPDATE)).toBe(true);
    expect(socket.connected).toBe(true);
  });

  it("answers board:joined with our state vector", () => {
    socket.receive(EVENTS.BOARD_JOINED, JOINED);
    const payload = socket.lastOf(EVENTS.SYNC_STEP);
    expect(payload).toBeInstanceOf(Uint8Array);
  });

  it("records who and what colour the server says we are", () => {
    socket.receive(EVENTS.BOARD_JOINED, JOINED);
    const { self } = session.getSnapshot();
    expect(self).toMatchObject({ name: "Ada", signedIn: false });
    expect(self?.color.name).toBe("teal");
  });

  it("publishes the colour name, not the hex, over awareness", () => {
    socket.receive(EVENTS.BOARD_JOINED, JOINED);
    const local = session.awareness.getLocalState() as { color: string };
    expect(local.color).toBe("teal");
  });

  it("sends the server exactly the updates it is missing", () => {
    const theirs = new Y.Doc();
    theirs.getMap("elements").set("a", 1);

    socket.receive(EVENTS.SYNC_STEP, Y.encodeStateVector(theirs));

    const update = socket.lastOf(EVENTS.SYNC_UPDATE) as Uint8Array;
    expect(update).toBeInstanceOf(Uint8Array);
    // Applying it must not throw and must leave their doc consistent.
    expect(() => Y.applyUpdate(theirs, update)).not.toThrow();
  });

  it("stays un-hydrated until the server answers", () => {
    socket.receive(EVENTS.BOARD_JOINED, JOINED);
    expect(session.getSnapshot().hydrated).toBe(false);
  });

  it("hydrates on the first sync:update", () => {
    const theirs = new Y.Doc();
    theirs.getMap("elements").set("a", 1);
    socket.receive(EVENTS.SYNC_UPDATE, Y.encodeStateAsUpdate(theirs));

    expect(session.getSnapshot().hydrated).toBe(true);
    expect(elementsOf(session.doc).get("a")).toBe(1);
  });

  // A wedged handshake must not leave a permanently blank canvas.
  it("hydrates on a fallback timer if the server never answers", () => {
    vi.useFakeTimers();
    const s = start();
    socket.receive(EVENTS.BOARD_JOINED, JOINED);
    expect(s.getSnapshot().hydrated).toBe(false);
    vi.advanceTimersByTime(3000);
    expect(s.getSnapshot().hydrated).toBe(true);
  });

  // This is what the browser actually delivers — the server emits Uint8Array
  // but Socket.IO hands the client an ArrayBuffer.
  it("applies an update arriving as an ArrayBuffer", () => {
    const theirs = new Y.Doc();
    theirs.getMap("elements").set("a", "hello");
    const update = Y.encodeStateAsUpdate(theirs);
    const buffer = update.buffer.slice(
      update.byteOffset,
      update.byteOffset + update.byteLength,
    ) as ArrayBuffer;

    expect(() => socket.receive(EVENTS.SYNC_UPDATE, buffer)).not.toThrow();
    expect(elementsOf(session.doc).get("a")).toBe("hello");
  });

  it("ignores a payload that isn't binary rather than throwing", () => {
    expect(() => socket.receive(EVENTS.SYNC_UPDATE, { nope: true })).not.toThrow();
    expect(() => socket.receive(EVENTS.SYNC_STEP, "nope")).not.toThrow();
  });

  it("sends one update for a local transaction", () => {
    const before = socket.countOf(EVENTS.SYNC_UPDATE);
    session.doc.transact(() => {
      elementsOf(session.doc).set("a", 1);
      elementsOf(session.doc).set("b", 2);
      elementsOf(session.doc).set("c", 3);
    });
    expect(socket.countOf(EVENTS.SYNC_UPDATE) - before).toBe(1);
  });

  // The echo guard. Without it, every remote update bounces straight back and
  // two clients saturate each other.
  it("never echoes a remote update back to the server", () => {
    const theirs = new Y.Doc();
    theirs.getMap("elements").set("a", 1);

    const before = socket.countOf(EVENTS.SYNC_UPDATE);
    socket.receive(EVENTS.SYNC_UPDATE, Y.encodeStateAsUpdate(theirs));
    expect(socket.countOf(EVENTS.SYNC_UPDATE)).toBe(before);
  });

  it("never echoes a remote awareness update back", () => {
    const theirDoc = new Y.Doc();
    const theirAwareness = new Awareness(theirDoc);
    theirAwareness.setLocalState({ name: "Bo", color: "coral", signedIn: false, cursor: null });
    const update = encodeAwarenessUpdate(theirAwareness, [theirDoc.clientID]);

    const before = socket.countOf(EVENTS.AWARENESS_UPDATE);
    socket.receive(EVENTS.AWARENESS_UPDATE, update);
    expect(socket.countOf(EVENTS.AWARENESS_UPDATE)).toBe(before);
  });

  it("surfaces a remote peer with its palette colour resolved", () => {
    const theirDoc = new Y.Doc();
    const theirAwareness = new Awareness(theirDoc);
    theirAwareness.setLocalState({ name: "Bo", color: "coral", signedIn: false, cursor: null });
    socket.receive(
      EVENTS.AWARENESS_UPDATE,
      encodeAwarenessUpdate(theirAwareness, [theirDoc.clientID]),
    );

    const { peers } = session.getSnapshot();
    expect(peers).toHaveLength(1);
    expect(peers[0]).toMatchObject({ name: "Bo", clientId: theirDoc.clientID });
    expect(peers[0].color.base).toBe("#E5613C");
  });

  // A refusal destroys the manager (active === false) and will never retry;
  // an engine blip leaves it active. Never string-match transport errors.
  it("treats an inactive connect_error as a terminal refusal", () => {
    socket.active = false;
    socket.receive("connect_error", new Error("board_expired"));

    const { status, refusal } = session.getSnapshot();
    expect(status).toBe("refused");
    expect(refusal?.reason).toBe("board_expired");
    expect(refusal?.message).toMatch(/expired/i);
  });

  it("treats an active connect_error as a transport blip", () => {
    socket.active = true;
    socket.receive("connect_error", new Error("xhr poll error"));
    expect(session.getSnapshot().status).toBe("reconnecting");
  });

  it("maps an unrecognised refusal to the generic copy", () => {
    socket.active = false;
    socket.receive("connect_error", new Error("something_new"));
    expect(session.getSnapshot().refusal?.reason).toBe("handshake_failed");
  });

  it("distinguishes a deliberate close from a dropped connection", () => {
    socket.receive("disconnect", "transport close");
    expect(session.getSnapshot().status).toBe("reconnecting");
    socket.receive("disconnect", "io client disconnect");
    expect(session.getSnapshot().status).toBe("closed");
  });

  it("surfaces a named server error", () => {
    socket.receive(EVENTS.ERROR, { message: "Too large.", next: "Try less." });
    expect(session.getSnapshot().lastError).toEqual({
      message: "Too large.",
      next: "Try less.",
    });
  });

  it("throttles a burst of cursor moves into one publish", () => {
    vi.useFakeTimers();
    const s = start();
    const before = socket.countOf(EVENTS.AWARENESS_UPDATE);

    for (let i = 0; i < 10; i++) s.setCursor({ x: i * 10, y: i * 10 });

    // Leading edge only; the rest coalesce into the trailing flush.
    expect(socket.countOf(EVENTS.AWARENESS_UPDATE) - before).toBe(1);
    vi.advanceTimersByTime(50);
    expect(socket.countOf(EVENTS.AWARENESS_UPDATE) - before).toBe(2);
    // The last point wins, not the first.
    const cursor = (s.awareness.getLocalState() as { cursor: { x: number } }).cursor;
    expect(cursor.x).toBe(90);
  });

  it("ignores a move too small to see", () => {
    vi.useFakeTimers();
    const s = start();
    s.setCursor({ x: 100, y: 100 });
    const after = socket.countOf(EVENTS.AWARENESS_UPDATE);
    s.setCursor({ x: 100.1, y: 100.1 });
    vi.advanceTimersByTime(50);
    expect(socket.countOf(EVENTS.AWARENESS_UPDATE)).toBe(after);
  });

  it("retracts its own cursor and detaches everything on destroy", () => {
    const s = start();
    s.destroy();
    expect(socket.disconnected).toBe(true);
    expect(socket.handlers.size).toBe(0);
  });

  it("ignores a cursor set after destroy", () => {
    const s = start();
    s.destroy();
    expect(() => s.setCursor({ x: 1, y: 1 })).not.toThrow();
  });
});
