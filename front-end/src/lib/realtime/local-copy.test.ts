import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as Y from "yjs";
import { forgetLocalCopies, openLocalCopy, type LocalCopy } from "./local-copy";

const CREATED = "2026-01-01T00:00:00.000Z";
const LATER = "2026-06-01T00:00:00.000Z";

const open: LocalCopy[] = [];

/** A doc kept under this board, once whatever was stored has loaded. */
async function kept(boardId: string, createdAt = CREATED): Promise<Y.Doc> {
  const doc = new Y.Doc();
  const copy = openLocalCopy(boardId, createdAt, doc)!;
  open.push(copy);
  expect(await copy.loaded).toBe(true);
  return doc;
}

/** IndexedDB writes are queued; let them land before the next open reads them. */
const written = () => new Promise((r) => setTimeout(r, 20));

async function closeAll(): Promise<void> {
  for (const copy of open.splice(0)) copy.destroy();
  await written();
}

beforeEach(() => {
  // A fresh, empty IndexedDB per test.
  globalThis.indexedDB = new IDBFactory();
  window.localStorage.clear();
});

afterEach(async () => {
  await closeAll();
  vi.useRealTimers();
});

describe("openLocalCopy", () => {
  it("brings back what was drawn, in a new doc", async () => {
    const first = await kept("k3m9p");
    first.getMap("elements").set("note", "still here");
    await closeAll();

    const second = await kept("k3m9p");

    expect(second.getMap("elements").get("note")).toBe("still here");
  });

  it("keeps boards apart", async () => {
    const first = await kept("k3m9p");
    first.getMap("elements").set("note", "mine");
    await closeAll();

    const other = await kept("zzzzz");

    expect(other.getMap("elements").size).toBe(0);
  });

  // An id can be taken again once its board is gone. The old board's copy must
  // never be merged into the new one.
  it("does not hand a new board the copy of an old one with the same id", async () => {
    const old = await kept("standup", CREATED);
    old.getMap("elements").set("note", "last year's");
    await closeAll();

    const fresh = await kept("standup", LATER);

    expect(fresh.getMap("elements").size).toBe(0);
  });

  it("deletes the old board's copy once the new one opens", async () => {
    const old = await kept("standup", CREATED);
    old.getMap("elements").set("note", "last year's");
    await closeAll();

    await kept("standup", LATER);
    await closeAll();

    // Even opened under its own name again, there is nothing left.
    const again = await kept("standup", CREATED);
    expect(again.getMap("elements").size).toBe(0);
  });

  it("deletes a copy nobody has opened in a month", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    const stale = await kept("oldie");
    stale.getMap("elements").set("note", "forgotten");
    await closeAll();

    vi.setSystemTime(new Date("2026-03-01T00:00:00Z"));
    await kept("k3m9p");
    await closeAll();

    const again = await kept("oldie");
    expect(again.getMap("elements").size).toBe(0);
  });

  it("keeps a copy that was opened recently", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    const recent = await kept("recent");
    recent.getMap("elements").set("note", "kept");
    await closeAll();

    vi.setSystemTime(new Date("2026-01-20T00:00:00Z"));
    await kept("k3m9p");
    await closeAll();

    const again = await kept("recent");
    expect(again.getMap("elements").get("note")).toBe("kept");
  });

  it("says so, rather than throwing, when the browser refuses to open a database", async () => {
    const refusing = new IDBFactory();
    refusing.open = () => {
      throw new DOMException("blocked", "SecurityError");
    };
    globalThis.indexedDB = refusing;

    const copy = openLocalCopy("k3m9p", CREATED, new Y.Doc())!;
    open.push(copy);

    expect(await copy.loaded).toBe(false);
  });

  it("reports nothing kept if it was torn down before it finished loading", async () => {
    const copy = openLocalCopy("k3m9p", CREATED, new Y.Doc())!;
    copy.destroy();

    expect(await copy.loaded).toBe(false);
  });

  it("survives an index that isn't what it wrote", async () => {
    window.localStorage.setItem("skrivle-local-copies", "{not json");

    const doc = await kept("k3m9p");

    expect(doc.getMap("elements").size).toBe(0);
  });
});

describe("forgetLocalCopies", () => {
  it("deletes this browser's copy of a board that is gone", async () => {
    const doc = await kept("k3m9p");
    doc.getMap("elements").set("note", "gone");
    await closeAll();

    forgetLocalCopies("k3m9p");
    await written();

    const again = await kept("k3m9p");
    expect(again.getMap("elements").size).toBe(0);
  });

  it("leaves other boards' copies alone, even ones whose id starts the same", async () => {
    const doc = await kept("k3m9pp");
    doc.getMap("elements").set("note", "kept");
    await closeAll();

    forgetLocalCopies("k3m9p");
    await written();

    const again = await kept("k3m9pp");
    expect(again.getMap("elements").get("note")).toBe("kept");
  });
});
