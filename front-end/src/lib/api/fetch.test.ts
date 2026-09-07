import { afterEach, describe, expect, it, vi } from "vitest";
import { API_URL } from "./config";
import { ApiError } from "./errors";
import { apiFetch } from "./fetch";

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
    ...init,
  });
}

// The shape apiFetch actually passes, rather than the ambient RequestInit
// (which cloudflare-env.d.ts widens with Workers-only properties).
type FetchInit = {
  method?: string;
  body?: string;
  headers?: Record<string, string>;
  credentials?: string;
};

function stubFetch(response: Response | Promise<never>) {
  const spy = vi.fn<(url: string, init: FetchInit) => Promise<Response>>(() =>
    response instanceof Response ? Promise.resolve(response) : response,
  );
  vi.stubGlobal("fetch", spy);
  return spy;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("apiFetch", () => {
  it("sends credentials on every call, so the session cookie rides along", async () => {
    const spy = stubFetch(jsonResponse({ ok: true }));
    await apiFetch("/api/auth/me");
    expect(spy.mock.calls[0][1]).toMatchObject({ credentials: "include" });
  });

  it("prefixes the configured API origin", async () => {
    const spy = stubFetch(jsonResponse({ ok: true }));
    await apiFetch("/api/auth/me");
    expect(spy.mock.calls[0][0]).toBe(`${API_URL}/api/auth/me`);
  });

  // express.json() leaves req.body undefined with no body, and every zod schema
  // is a z.object that rejects undefined — so a bodyless POST 400s.
  it("sends '{}' and a JSON content-type for a bodyless POST", async () => {
    const spy = stubFetch(jsonResponse({ id: "k3m9p" }, { status: 201 }));
    await apiFetch("/api/boards", { method: "POST" });
    const init = spy.mock.calls[0][1];
    expect(init.body).toBe("{}");
    expect(init.headers).toMatchObject({ "Content-Type": "application/json" });
  });

  it("serialises a provided body", async () => {
    const spy = stubFetch(jsonResponse({ ok: true }));
    await apiFetch("/api/auth/email/request", {
      method: "POST",
      body: { email: "a@b.co" },
    });
    expect(spy.mock.calls[0][1].body).toBe(
      '{"email":"a@b.co"}',
    );
  });

  it("sends no body or content-type on a GET", async () => {
    const spy = stubFetch(jsonResponse({ ok: true }));
    await apiFetch("/api/boards");
    const init = spy.mock.calls[0][1];
    expect(init.body).toBeUndefined();
    expect(init.headers).toEqual({});
  });

  it("resolves undefined for 204, which carries no JSON to parse", async () => {
    stubFetch(new Response(null, { status: 204 }));
    await expect(apiFetch("/api/auth/logout", { method: "POST" })).resolves.toBeUndefined();
  });

  it("turns the error envelope into an ApiError carrying message and next", async () => {
    stubFetch(
      jsonResponse(
        { error: { message: "That board doesn't exist.", next: "Check the id." } },
        { status: 404 },
      ),
    );
    const err = await apiFetch("/api/boards/zzzzz").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({
      status: 404,
      message: "That board doesn't exist.",
      next: "Check the id.",
    });
  });

  it("reads Retry-After off a 429", async () => {
    stubFetch(
      jsonResponse(
        { error: { message: "Too many.", next: "Wait 5 minutes." } },
        { status: 429, headers: { "Retry-After": "300" } },
      ),
    );
    const err = (await apiFetch("/api/auth/email/request", {
      method: "POST",
    }).catch((e: unknown) => e)) as ApiError;
    expect(err.retryAfterSeconds).toBe(300);
  });

  it("falls back to usable copy when an error body isn't the envelope", async () => {
    stubFetch(new Response("<html>502 Bad Gateway</html>", { status: 502 }));
    const err = (await apiFetch("/api/boards").catch((e: unknown) => e)) as ApiError;
    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(502);
    expect(err.message).toBeTruthy();
    expect(err.next).toBeTruthy();
  });

  it("reports a request that never reached the server as status 0", async () => {
    stubFetch(Promise.reject(new TypeError("Failed to fetch")));
    const err = (await apiFetch("/api/auth/me").catch((e: unknown) => e)) as ApiError;
    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(0);
  });

  it("lets an AbortError through untouched so callers can ignore it", async () => {
    stubFetch(Promise.reject(new DOMException("Aborted", "AbortError")));
    const err = await apiFetch("/api/auth/me").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(DOMException);
    expect((err as DOMException).name).toBe("AbortError");
  });
});
