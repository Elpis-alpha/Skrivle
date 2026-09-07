import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";

// Capture outgoing mail instead of sending it. Must be hoisted above the
// server import so the route module picks up the stub.
const sent: { to: string; text: string }[] = [];
vi.mock("../../mail/transport.js", () => ({
  sendMail: vi.fn(async (mail: { to: string; text: string }) => {
    sent.push({ to: mail.to, text: mail.text });
    return true;
  }),
  verifyMailTransport: vi.fn(async () => true),
}));

const { createServer } = await import("../../server.js");
const { prisma } = await import("../../db/prisma.js");
const { flushTestKeys, useRedis } = await import("../../test/redis-harness.js");

useRedis();

const { app } = createServer();

/** Pull the code out of the captured message body. */
function codeFor(email: string): string {
  const message = [...sent].reverse().find((m) => m.to === email);
  if (!message) throw new Error(`no mail captured for ${email}`);
  const match = message.text.match(/(\d{3}) (\d{3})/);
  if (!match) throw new Error(`no code in: ${message.text}`);
  return match[1] + match[2];
}

beforeEach(async () => {
  sent.length = 0;
  await flushTestKeys("otp:*", "otpcool:*", "rl:*", "sess:*", "usess:*");
  await prisma.boardDoc.deleteMany();
  await prisma.board.deleteMany();
  await prisma.user.deleteMany();
});

describe("POST /api/auth/email/request", () => {
  it("accepts an address and sends a code", async () => {
    const res = await request(app)
      .post("/api/auth/email/request")
      .send({ email: "person@example.com" });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, expiresInSeconds: expect.any(Number) });
    expect(codeFor("person@example.com")).toMatch(/^\d{6}$/);
  });

  it("rejects a malformed address", async () => {
    const res = await request(app).post("/api/auth/email/request").send({ email: "not-an-email" });
    expect(res.status).toBe(400);
    expect(res.body.error.message).toContain("email");
    expect(sent).toHaveLength(0);
  });

  it("answers identically for an unknown address — no account enumeration", async () => {
    await request(app).post("/api/auth/email/request").send({ email: "known@example.com" });
    const code = codeFor("known@example.com");
    await request(app).post("/api/auth/email/verify").send({ email: "known@example.com", code });

    const known = await request(app)
      .post("/api/auth/email/request")
      .send({ email: "known@example.com" });
    const unknown = await request(app)
      .post("/api/auth/email/request")
      .send({ email: "nobody@example.com" });

    expect(known.status).toBe(unknown.status);
    expect(known.body).toEqual(unknown.body);
  });

  it("suppresses a resend inside the cooldown but still reports success", async () => {
    await request(app).post("/api/auth/email/request").send({ email: "person@example.com" });
    const res = await request(app)
      .post("/api/auth/email/request")
      .send({ email: "person@example.com" });

    expect(res.status).toBe(200);
    // One mail, two identical successful responses.
    expect(sent).toHaveLength(1);
  });
});

describe("POST /api/auth/email/verify", () => {
  async function requestCode(email = "person@example.com") {
    await request(app).post("/api/auth/email/request").send({ email });
    return codeFor(email);
  }

  it("signs in, sets an HttpOnly cookie, and creates the user", async () => {
    const code = await requestCode();
    const res = await request(app)
      .post("/api/auth/email/verify")
      .send({ email: "person@example.com", code });

    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({ email: "person@example.com" });

    const cookie = res.headers["set-cookie"][0];
    expect(cookie).toContain("skrivle_session=");
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Lax");

    expect(await prisma.user.count()).toBe(1);
    expect(await prisma.identity.count()).toBe(1);
  });

  it("rejects a wrong code", async () => {
    const code = await requestCode();
    const wrong = code === "000000" ? "111111" : "000000";
    const res = await request(app)
      .post("/api/auth/email/verify")
      .send({ email: "person@example.com", code: wrong });

    expect(res.status).toBe(400);
    expect(res.headers["set-cookie"]).toBeUndefined();
  });

  it("rejects a code that is not six digits before touching Redis", async () => {
    const res = await request(app)
      .post("/api/auth/email/verify")
      .send({ email: "person@example.com", code: "12ab" });
    expect(res.status).toBe(400);
  });

  it("will not accept the same code twice", async () => {
    const code = await requestCode();
    const first = await request(app)
      .post("/api/auth/email/verify")
      .send({ email: "person@example.com", code });
    const second = await request(app)
      .post("/api/auth/email/verify")
      .send({ email: "person@example.com", code });

    expect(first.status).toBe(200);
    expect(second.status).toBe(400);
  });

  it("signs the same person back into one account, not two", async () => {
    const first = await requestCode();
    await request(app).post("/api/auth/email/verify").send({ email: "person@example.com", code: first });
    const second = await requestCode();
    await request(app).post("/api/auth/email/verify").send({ email: "person@example.com", code: second });

    expect(await prisma.user.count()).toBe(1);
  });
});

describe("GET /api/auth/me", () => {
  it("reports no user for an anonymous caller", async () => {
    const res = await request(app).get("/api/auth/me");
    expect(res.status).toBe(200);
    expect(res.body.user).toBeNull();
    expect(res.body.methods).toHaveProperty("github");
  });

  it("returns the signed-in user when the cookie is presented", async () => {
    const agent = request.agent(app);
    await agent.post("/api/auth/email/request").send({ email: "person@example.com" });
    await agent
      .post("/api/auth/email/verify")
      .send({ email: "person@example.com", code: codeFor("person@example.com") });

    const res = await agent.get("/api/auth/me");
    expect(res.body.user).toMatchObject({ email: "person@example.com" });
  });

  it("ignores a forged session cookie", async () => {
    const res = await request(app).get("/api/auth/me").set("Cookie", "skrivle_session=made-up");
    expect(res.body.user).toBeNull();
  });
});

describe("POST /api/auth/logout", () => {
  it("clears the cookie and invalidates the session server-side", async () => {
    const agent = request.agent(app);
    await agent.post("/api/auth/email/request").send({ email: "person@example.com" });
    const signIn = await agent
      .post("/api/auth/email/verify")
      .send({ email: "person@example.com", code: codeFor("person@example.com") });

    const sessionCookie = signIn.headers["set-cookie"][0].split(";")[0];

    expect((await agent.post("/api/auth/logout")).status).toBe(204);
    expect((await agent.get("/api/auth/me")).body.user).toBeNull();

    // The token must be dead server-side, not merely dropped by the browser.
    const replay = await request(app).get("/api/auth/me").set("Cookie", sessionCookie);
    expect(replay.body.user).toBeNull();
  });
});

describe("OAuth redirects", () => {
  it("sends the browser to GitHub with a state parameter", async () => {
    const res = await request(app).get("/api/auth/github");
    // 503 when this deployment has no GitHub credentials configured.
    if (res.status === 503) return;

    expect(res.status).toBe(302);
    const location = new URL(res.headers.location);
    expect(location.host).toBe("github.com");
    expect(location.searchParams.get("state")).toBeTruthy();
  });

  it("refuses a callback with no state rather than signing anyone in", async () => {
    const res = await request(app).get("/api/auth/callback/github?code=abc");
    expect(res.status).toBe(302);
    expect(res.headers.location).toContain("error=invalid_state");
    expect(res.headers["set-cookie"]).toBeUndefined();
  });

  it("rejects an unknown provider", async () => {
    const res = await request(app).get("/api/auth/callback/facebook?code=a&state=b");
    expect(res.status).toBe(302);
    expect(res.headers.location).toContain("error=");
  });
});
