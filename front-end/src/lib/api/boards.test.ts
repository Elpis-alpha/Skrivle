import { afterEach, describe, expect, it, vi } from "vitest";
import { claimBoard, createBoard, deleteBoard, extendBoard, getBoard, listBoards, renameBoard } from "./boards";

type FetchInit = { method?: string; body?: string };

function stub() {
  const spy = vi.fn<(url: string, init: FetchInit) => Promise<Response>>(() =>
    Promise.resolve(
      new Response(JSON.stringify({}), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    ),
  );
  vi.stubGlobal("fetch", spy);
  return spy;
}

function call(spy: ReturnType<typeof stub>) {
  const [url, init] = spy.mock.calls[0];
  return { path: new URL(url).pathname, method: init.method, body: init.body };
}

afterEach(() => vi.unstubAllGlobals());

describe("board endpoints", () => {
  it("creates with a POST carrying the options", async () => {
    const spy = stub();
    await createBoard({ customId: "sprint-42" });
    expect(call(spy)).toEqual({
      path: "/api/boards",
      method: "POST",
      body: '{"customId":"sprint-42"}',
    });
  });

  it("creates with '{}' when given no options", async () => {
    const spy = stub();
    await createBoard();
    expect(call(spy).body).toBe("{}");
  });

  it("reads one board", async () => {
    const spy = stub();
    await getBoard("k3m9p");
    expect(call(spy)).toMatchObject({ path: "/api/boards/k3m9p", method: "GET" });
  });

  it("escapes the id rather than trusting it into the path", async () => {
    const spy = stub();
    await getBoard("a/b");
    expect(call(spy).path).toBe("/api/boards/a%2Fb");
  });

  it("lists My Boards", async () => {
    const spy = stub();
    await listBoards();
    expect(call(spy)).toMatchObject({ path: "/api/boards", method: "GET" });
  });

  it("extends with the creator token", async () => {
    const spy = stub();
    await extendBoard("k3m9p", "tok");
    expect(call(spy)).toEqual({
      path: "/api/boards/k3m9p/extend",
      method: "POST",
      body: '{"creatorToken":"tok"}',
    });
  });

  it("claims with the creator token", async () => {
    const spy = stub();
    await claimBoard("k3m9p", "tok");
    expect(call(spy)).toEqual({
      path: "/api/boards/k3m9p/claim",
      method: "POST",
      body: '{"creatorToken":"tok"}',
    });
  });

  it("renames with a PATCH", async () => {
    const spy = stub();
    await renameBoard("k3m9p", "Sprint plan");
    expect(call(spy)).toEqual({
      path: "/api/boards/k3m9p",
      method: "PATCH",
      body: '{"title":"Sprint plan"}',
    });
  });

  it("deletes with a DELETE and no body", async () => {
    const spy = stub();
    await deleteBoard("k3m9p");
    expect(call(spy)).toMatchObject({ path: "/api/boards/k3m9p", method: "DELETE" });
    expect(call(spy).body).toBeUndefined();
  });
});
