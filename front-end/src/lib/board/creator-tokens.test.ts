import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  creatorTokenFor,
  forgetCreatorToken,
  localBoards,
  pruneCreatorTokens,
  rememberCreatorToken,
} from "./creator-tokens";

const KEY = "skrivle-boards";

beforeEach(() => window.localStorage.clear());
afterEach(() => vi.restoreAllMocks());

describe("creator tokens", () => {
  it("round-trips a token", () => {
    rememberCreatorToken("k3m9p", "tok-1");
    expect(creatorTokenFor("k3m9p")).toBe("tok-1");
  });

  it("returns null for a board it has never seen", () => {
    expect(creatorTokenFor("nope1")).toBeNull();
  });

  // The server lowercases every id, so a link with different casing has to find
  // the same token or the board becomes unextendable.
  it("keys ids case-insensitively", () => {
    rememberCreatorToken("K3M9P", "tok-1");
    expect(creatorTokenFor("k3m9p")).toBe("tok-1");
    expect(creatorTokenFor("  K3m9P ")).toBe("tok-1");
  });

  it("forgets a token", () => {
    rememberCreatorToken("k3m9p", "tok-1");
    forgetCreatorToken("k3m9p");
    expect(creatorTokenFor("k3m9p")).toBeNull();
  });

  it("keeps other boards when forgetting one", () => {
    rememberCreatorToken("aaa11", "a");
    rememberCreatorToken("bbb22", "b");
    forgetCreatorToken("aaa11");
    expect(creatorTokenFor("bbb22")).toBe("b");
  });

  it("lists local boards newest first", () => {
    vi.spyOn(Date, "now").mockReturnValue(1_000);
    rememberCreatorToken("old11", "a", "Older");
    vi.spyOn(Date, "now").mockReturnValue(2_000);
    rememberCreatorToken("new22", "b", "Newer");
    expect(localBoards().map((b) => b.id)).toEqual(["new22", "old11"]);
    expect(localBoards()[0].title).toBe("Newer");
  });

  // 24h guest TTL plus one 48h extension: past 72h the token cannot buy anything.
  it("prunes entries older than 72h and keeps younger ones", () => {
    const t0 = 1_700_000_000_000;
    vi.spyOn(Date, "now").mockReturnValue(t0);
    rememberCreatorToken("stale1", "old");
    vi.spyOn(Date, "now").mockReturnValue(t0 + 71 * 60 * 60 * 1000);
    rememberCreatorToken("fresh1", "new");

    pruneCreatorTokens(t0 + 73 * 60 * 60 * 1000);

    expect(creatorTokenFor("stale1")).toBeNull();
    expect(creatorTokenFor("fresh1")).toBe("new");
  });

  it("survives corrupt stored JSON rather than throwing", () => {
    window.localStorage.setItem(KEY, "{not json");
    expect(creatorTokenFor("k3m9p")).toBeNull();
    expect(() => rememberCreatorToken("k3m9p", "tok")).not.toThrow();
    expect(creatorTokenFor("k3m9p")).toBe("tok");
  });

  it("survives a stored value of the wrong shape", () => {
    window.localStorage.setItem(KEY, JSON.stringify({ v: 1 }));
    expect(creatorTokenFor("k3m9p")).toBeNull();
  });

  // Safari private mode and "block site data" make these accessors throw.
  it("survives a localStorage that throws on read and write", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("denied");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("denied");
    });
    expect(creatorTokenFor("k3m9p")).toBeNull();
    expect(() => rememberCreatorToken("k3m9p", "tok")).not.toThrow();
    expect(() => pruneCreatorTokens()).not.toThrow();
    expect(localBoards()).toEqual([]);
  });
});
