import { beforeEach, describe, expect, it } from "vitest";
import { beginAuthorization, consumeState, safeReturnTo } from "./flow.js";
import { flushTestKeys, useRedis } from "../../test/redis-harness.js";

useRedis();
beforeEach(async () => {
  await flushTestKeys("oauth:*");
});

describe("safeReturnTo", () => {
  it("keeps a same-origin path", () => {
    expect(safeReturnTo("/board/abc")).toBe("/board/abc");
    expect(safeReturnTo("/boards?sort=recent")).toBe("/boards?sort=recent");
  });

  it("defaults to the root when absent", () => {
    expect(safeReturnTo(undefined)).toBe("/");
    expect(safeReturnTo("")).toBe("/");
  });

  it("rejects absolute URLs — otherwise the callback is an open redirect", () => {
    expect(safeReturnTo("https://evil.example/steal")).toBe("/");
    expect(safeReturnTo("http://evil.example")).toBe("/");
  });

  it("rejects protocol-relative paths, which resolve off-origin", () => {
    // "//evil.example" is a valid URL meaning https://evil.example — it starts
    // with "/" but is not a local path.
    expect(safeReturnTo("//evil.example")).toBe("/");
  });

  it("rejects anything not starting with a slash", () => {
    expect(safeReturnTo("javascript:alert(1)")).toBe("/");
    expect(safeReturnTo("board/abc")).toBe("/");
  });
});

describe("beginAuthorization", () => {
  it("builds a GitHub URL with state and the email scope", async () => {
    const url = new URL(await beginAuthorization({ provider: "github" }));

    expect(url.origin + url.pathname).toBe("https://github.com/login/oauth/authorize");
    expect(url.searchParams.get("response_type")).toBe("code");
    // Without user:email there is no verified address to link on.
    expect(url.searchParams.get("scope")).toContain("user:email");
    expect(url.searchParams.get("state")).toBeTruthy();
    // GitHub OAuth Apps do not support PKCE.
    expect(url.searchParams.get("code_challenge")).toBeNull();
  });

  it("builds a Google URL with PKCE", async () => {
    const url = new URL(await beginAuthorization({ provider: "google" }));

    expect(url.origin + url.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    expect(url.searchParams.get("scope")).toContain("openid");
    expect(url.searchParams.get("code_challenge")).toBeTruthy();
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
  });

  it("never repeats a state value", async () => {
    const states = new Set<string>();
    for (let i = 0; i < 50; i++) {
      const url = new URL(await beginAuthorization({ provider: "github" }));
      states.add(url.searchParams.get("state")!);
    }
    expect(states.size).toBe(50);
  });

  it("stores the return path and board to claim alongside the state", async () => {
    const url = new URL(
      await beginAuthorization({
        provider: "google",
        returnTo: "/board/k3m9p",
        claimBoardId: "k3m9p",
      }),
    );
    const state = await consumeState(url.searchParams.get("state")!);

    expect(state).toMatchObject({
      provider: "google",
      returnTo: "/board/k3m9p",
      claimBoardId: "k3m9p",
    });
    expect(state!.verifier).toBeTruthy();
  });

  it("sanitises returnTo before storing it", async () => {
    const url = new URL(
      await beginAuthorization({ provider: "github", returnTo: "https://evil.example" }),
    );
    const state = await consumeState(url.searchParams.get("state")!);
    expect(state!.returnTo).toBe("/");
  });
});

describe("consumeState", () => {
  it("returns null for an unknown state", async () => {
    expect(await consumeState("never-issued")).toBeNull();
  });

  it("returns null for a missing state", async () => {
    expect(await consumeState(undefined)).toBeNull();
  });

  it("is single-use, so a replayed callback cannot mint a second session", async () => {
    const url = new URL(await beginAuthorization({ provider: "github" }));
    const state = url.searchParams.get("state")!;

    expect(await consumeState(state)).not.toBeNull();
    expect(await consumeState(state)).toBeNull();
  });
});
