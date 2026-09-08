import { afterEach, describe, expect, it, vi } from "vitest";

// The transport is the one part of the back-end that talks to a third party
// over the network in a way tests should not, so here — and only here — fetch
// is stubbed. env.ts snapshots the environment at import time, so each case
// resets modules and supplies its own MAIL_* values and fetch implementation.
type FetchImpl = (url: string, init?: RequestInit) => Promise<Response>;

async function loadTransport(fetchImpl: FetchImpl) {
  vi.resetModules();
  vi.stubEnv("MAIL_CLIENT_ID", "client-id");
  vi.stubEnv("MAIL_CLIENT_SECRET", "client-secret");
  vi.stubEnv("MAIL_REFRESH_TOKEN", "refresh-token");
  vi.stubEnv("MAIL_ADDRESS", "sender@example.com");
  vi.stubEnv("AUTH_DEV_CODES", "");
  vi.stubGlobal("fetch", vi.fn(fetchImpl));
  return import("./transport.js");
}

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const SEND_URL = "https://gmail.googleapis.com/gmail/v1/users/me/messages/send";

const json = (body: unknown, init?: ResponseInit) =>
  new Response(JSON.stringify(body), { status: 200, ...init });

/** A fetch that answers the token endpoint and the send endpoint happily. */
function happyFetch(): FetchImpl {
  return async (url) => {
    if (url === TOKEN_URL) return json({ access_token: "access-123", expires_in: 3600 });
    if (url === SEND_URL) return json({ id: "msg-1", threadId: "t-1", labelIds: ["SENT"] });
    throw new Error(`unexpected fetch to ${url}`);
  };
}

const message = { to: "person@example.com", subject: "hi", text: "body", html: "<b>body</b>" };

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe("sendMail over the Gmail HTTPS API", () => {
  it("POSTs a base64url message to Gmail with a bearer token", async () => {
    const { sendMail } = await loadTransport(happyFetch());

    expect(await sendMail(message)).toBe(true);

    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    const send = fetchMock.mock.calls.find(([url]) => url === SEND_URL);
    expect(send).toBeDefined();

    const init = send![1] as RequestInit;
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer access-123");

    const raw = (JSON.parse(init.body as string) as { raw: string }).raw;
    expect(raw).toMatch(/^[A-Za-z0-9_-]+$/); // base64url: no +, /, or =
    expect(Buffer.from(raw, "base64url").toString("utf8")).toContain("person@example.com");
  });

  it("reuses the access token across sends instead of refreshing every time", async () => {
    const { sendMail } = await loadTransport(happyFetch());

    await sendMail(message);
    await sendMail(message);

    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    const tokenCalls = fetchMock.mock.calls.filter(([url]) => url === TOKEN_URL);
    expect(tokenCalls).toHaveLength(1);
  });

  it("resolves false rather than throwing when the token refresh fails", async () => {
    const { sendMail } = await loadTransport(async (url) => {
      if (url === TOKEN_URL) return json({ error: "invalid_grant" }, { status: 400 });
      throw new Error(`unexpected fetch to ${url}`);
    });

    await expect(sendMail(message)).resolves.toBe(false);
  });

  it("retries once with a fresh token when Gmail answers 401", async () => {
    let sends = 0;
    const { sendMail } = await loadTransport(async (url) => {
      if (url === TOKEN_URL) return json({ access_token: `access-${Date.now()}`, expires_in: 3600 });
      if (url === SEND_URL) {
        sends += 1;
        return sends === 1 ? json({ error: "unauthorized" }, { status: 401 }) : json({ id: "ok" });
      }
      throw new Error(`unexpected fetch to ${url}`);
    });

    expect(await sendMail(message)).toBe(true);
    expect(sends).toBe(2);
  });
});

describe("verifyMailTransport", () => {
  it("is true when a token can be minted", async () => {
    const { verifyMailTransport } = await loadTransport(happyFetch());
    expect(await verifyMailTransport()).toBe(true);
  });

  it("is false when the credentials are rejected", async () => {
    const { verifyMailTransport } = await loadTransport(async () =>
      json({ error: "invalid_client" }, { status: 401 }),
    );
    expect(await verifyMailTransport()).toBe(false);
  });
});
