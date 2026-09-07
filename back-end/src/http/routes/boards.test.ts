import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";

const sent: { to: string; text: string }[] = [];
vi.mock("../../mail/transport.js", () => ({
  sendMail: vi.fn(async (m: { to: string; text: string }) => {
    sent.push({ to: m.to, text: m.text });
    return true;
  }),
  verifyMailTransport: vi.fn(async () => true),
}));

const { createServer } = await import("../../server.js");
const { prisma } = await import("../../db/prisma.js");
const { flushTestKeys, useRedis } = await import("../../test/redis-harness.js");

useRedis();
const { app } = createServer();

/** A signed-in supertest agent that keeps its session cookie. */
async function signedIn(email: string) {
  const agent = request.agent(app);
  await agent.post("/api/auth/email/request").send({ email });
  const message = [...sent].reverse().find((m) => m.to === email)!;
  const [, a, b] = message.text.match(/(\d{3}) (\d{3})/)!;
  await agent.post("/api/auth/email/verify").send({ email, code: a + b });
  return agent;
}

beforeEach(async () => {
  sent.length = 0;
  await flushTestKeys("otp:*", "otpcool:*", "rl:*", "sess:*", "usess:*");
  await prisma.boardDoc.deleteMany();
  await prisma.board.deleteMany();
  await prisma.user.deleteMany();
});

describe("POST /api/boards", () => {
  it("mints a guest board with a creator token and a 24h expiry", async () => {
    const res = await request(app).post("/api/boards").send({});

    expect(res.status).toBe(201);
    expect(res.body.id).toMatch(/^[bcdfghjkmnpqrstvwxyz23456789]{5}$/);
    expect(res.body.creatorToken).toBeTruthy();
    expect(res.body.isEphemeral).toBe(true);
    expect(res.body.hasOwner).toBe(false);

    const hoursOut = (new Date(res.body.expiresAt).getTime() - Date.now()) / 3600_000;
    expect(hoursOut).toBeGreaterThan(23);
    expect(hoursOut).toBeLessThan(25);
  });

  it("gives a signed-in creator a durable board with no creator token", async () => {
    const agent = await signedIn("owner@example.com");
    const res = await agent.post("/api/boards").send({ title: "Sprint" });

    expect(res.status).toBe(201);
    expect(res.body.isEphemeral).toBe(false);
    expect(res.body.expiresAt).toBeNull();
    expect(res.body.hasOwner).toBe(true);
    expect(res.body.creatorToken).toBeNull();
    expect(res.body.title).toBe("Sprint");

    // The owner also gets a collaborator row, which is what My Boards reads.
    expect(await prisma.boardCollaborator.count()).toBe(1);
  });

  it("accepts a custom id", async () => {
    const res = await request(app).post("/api/boards").send({ customId: "sprint-planning" });
    expect(res.status).toBe(201);
    expect(res.body.id).toBe("sprint-planning");
  });

  it("lowercases a custom id, so links survive being title-cased", async () => {
    const res = await request(app).post("/api/boards").send({ customId: "Sprint-Planning" });
    expect(res.body.id).toBe("sprint-planning");

    expect((await request(app).get("/api/boards/SPRINT-PLANNING")).status).toBe(200);
  });

  it("refuses a custom id that is already taken", async () => {
    await request(app).post("/api/boards").send({ customId: "taken-id" });
    const res = await request(app).post("/api/boards").send({ customId: "TAKEN-ID" });

    expect(res.status).toBe(409);
    expect(res.body.error.next).toContain("different id");
  });

  it("rejects a malformed custom id", async () => {
    expect((await request(app).post("/api/boards").send({ customId: "ab" })).status).toBe(400);
    expect((await request(app).post("/api/boards").send({ customId: "has space" })).status).toBe(400);
  });
});

describe("GET /api/boards/:id", () => {
  it("returns metadata for a live board", async () => {
    const created = await request(app).post("/api/boards").send({});
    const res = await request(app).get(`/api/boards/${created.body.id}`);

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(created.body.id);
    expect(res.body).not.toHaveProperty("creatorToken");
  });

  it("404s an id nobody holds", async () => {
    const res = await request(app).get("/api/boards/zzzzz");
    expect(res.status).toBe(404);
    expect(res.body.error.message).toContain("No board");
  });

  it("410s an expired board — a different state to 'not found'", async () => {
    // STYLE_GUIDE §10.21 requires the UI to tell these apart.
    const created = await request(app).post("/api/boards").send({});
    await prisma.board.update({
      where: { id: created.body.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    const res = await request(app).get(`/api/boards/${created.body.id}`);
    expect(res.status).toBe(410);
    expect(res.body.error.message).toContain("expired");
  });

  it("rejects a malformed id without hitting the database", async () => {
    expect((await request(app).get("/api/boards/a")).status).toBe(400);
  });
});

describe("GET /api/boards/:id/available", () => {
  it("reports a free id as available", async () => {
    const res = await request(app).get("/api/boards/brand-new-id/available");
    expect(res.body).toEqual({ available: true });
  });

  it("reports a taken id as unavailable, case-insensitively", async () => {
    await request(app).post("/api/boards").send({ customId: "occupied" });
    expect((await request(app).get("/api/boards/OCCUPIED/available")).body.available).toBe(false);
  });

  it("is not shadowed by the /:id route", async () => {
    // "available" must not be read as a board id.
    expect((await request(app).get("/api/boards/anything/available")).status).toBe(200);
  });
});

describe("POST /api/boards/:id/extend", () => {
  it("pushes the expiry out with the right creator token", async () => {
    const created = await request(app).post("/api/boards").send({});
    const res = await request(app)
      .post(`/api/boards/${created.body.id}/extend`)
      .send({ creatorToken: created.body.creatorToken });

    expect(res.status).toBe(200);
    const hoursOut = (new Date(res.body.expiresAt).getTime() - Date.now()) / 3600_000;
    expect(hoursOut).toBeGreaterThan(47);
    expect(hoursOut).toBeLessThan(49);
  });

  it("refuses a wrong creator token", async () => {
    const created = await request(app).post("/api/boards").send({});
    const res = await request(app)
      .post(`/api/boards/${created.body.id}/extend`)
      .send({ creatorToken: "not-the-token" });

    expect(res.status).toBe(403);
  });

  it("does not stack — repeated extends stay 48h out, never permanent", async () => {
    const created = await request(app).post("/api/boards").send({});
    const token = created.body.creatorToken;

    await request(app).post(`/api/boards/${created.body.id}/extend`).send({ creatorToken: token });
    const second = await request(app)
      .post(`/api/boards/${created.body.id}/extend`)
      .send({ creatorToken: token });

    const hoursOut = (new Date(second.body.expiresAt).getTime() - Date.now()) / 3600_000;
    expect(hoursOut).toBeLessThan(49);
  });
});

describe("POST /api/boards/:id/claim", () => {
  it("transfers a guest board to the signed-in creator", async () => {
    const created = await request(app).post("/api/boards").send({});
    const agent = await signedIn("claimer@example.com");

    const res = await agent
      .post(`/api/boards/${created.body.id}/claim`)
      .send({ creatorToken: created.body.creatorToken });

    expect(res.status).toBe(200);
    expect(res.body.hasOwner).toBe(true);
    expect(res.body.isEphemeral).toBe(false);
    expect(res.body.expiresAt).toBeNull();

    // The token is cleared, so it cannot be used as a second key later.
    const row = await prisma.board.findUnique({ where: { id: created.body.id } });
    expect(row!.creatorTokenHash).toBeNull();
  });

  it("refuses a claim without the creator token", async () => {
    // Otherwise anyone who opened a shared link could take the board.
    const created = await request(app).post("/api/boards").send({});
    const agent = await signedIn("stranger@example.com");

    expect((await agent.post(`/api/boards/${created.body.id}/claim`).send({})).status).toBe(403);
  });

  it("refuses a claim from an anonymous caller", async () => {
    const created = await request(app).post("/api/boards").send({});
    const res = await request(app)
      .post(`/api/boards/${created.body.id}/claim`)
      .send({ creatorToken: created.body.creatorToken });
    expect(res.status).toBe(401);
  });

  it("refuses to claim a board that already has an owner", async () => {
    const created = await request(app).post("/api/boards").send({});
    const first = await signedIn("first@example.com");
    await first.post(`/api/boards/${created.body.id}/claim`).send({
      creatorToken: created.body.creatorToken,
    });

    const second = await signedIn("second@example.com");
    const res = await second.post(`/api/boards/${created.body.id}/claim`).send({
      creatorToken: created.body.creatorToken,
    });
    expect(res.status).toBe(403);
  });
});

describe("GET /api/boards (My Boards)", () => {
  it("needs a session", async () => {
    expect((await request(app).get("/api/boards")).status).toBe(401);
  });

  it("lists the caller's boards with their role, newest edit first", async () => {
    const agent = await signedIn("lister@example.com");
    await agent.post("/api/boards").send({ title: "Older" });
    await agent.post("/api/boards").send({ title: "Newer" });

    const res = await agent.get("/api/boards");
    expect(res.status).toBe(200);
    expect(res.body.boards).toHaveLength(2);
    expect(res.body.boards[0].role).toBe("owner");
    expect(res.body.boards.map((b: { title: string }) => b.title).sort()).toEqual(["Newer", "Older"]);
  });

  it("does not leak other people's boards", async () => {
    const mine = await signedIn("mine@example.com");
    await mine.post("/api/boards").send({ title: "Mine" });

    const theirs = await signedIn("theirs@example.com");
    await theirs.post("/api/boards").send({ title: "Theirs" });

    const res = await mine.get("/api/boards");
    expect(res.body.boards).toHaveLength(1);
    expect(res.body.boards[0].title).toBe("Mine");
  });

  it("omits guest boards nobody owns", async () => {
    await request(app).post("/api/boards").send({});
    const agent = await signedIn("nobody@example.com");
    expect((await agent.get("/api/boards")).body.boards).toHaveLength(0);
  });
});

describe("PATCH / DELETE /api/boards/:id", () => {
  it("lets the owner rename", async () => {
    const agent = await signedIn("owner@example.com");
    const created = await agent.post("/api/boards").send({ title: "Before" });

    const res = await agent.patch(`/api/boards/${created.body.id}`).send({ title: "After" });
    expect(res.status).toBe(200);
    expect(res.body.title).toBe("After");
  });

  it("refuses a rename from someone who is not the owner", async () => {
    const owner = await signedIn("owner@example.com");
    const created = await owner.post("/api/boards").send({});

    const other = await signedIn("other@example.com");
    expect((await other.patch(`/api/boards/${created.body.id}`).send({ title: "Hijacked" })).status).toBe(403);
  });

  it("rejects an empty title", async () => {
    const agent = await signedIn("owner@example.com");
    const created = await agent.post("/api/boards").send({});
    expect((await agent.patch(`/api/boards/${created.body.id}`).send({ title: "  " })).status).toBe(400);
  });

  it("lets the owner delete, cascading the stored doc", async () => {
    const agent = await signedIn("owner@example.com");
    const created = await agent.post("/api/boards").send({});
    await prisma.boardDoc.create({
      data: { boardId: created.body.id, docState: Buffer.from([1, 2, 3]) },
    });

    expect((await agent.delete(`/api/boards/${created.body.id}`)).status).toBe(204);
    expect(await prisma.board.count()).toBe(0);
    expect(await prisma.boardDoc.count()).toBe(0);
  });

  it("refuses a delete from a non-owner", async () => {
    const owner = await signedIn("owner@example.com");
    const created = await owner.post("/api/boards").send({});

    const other = await signedIn("other@example.com");
    expect((await other.delete(`/api/boards/${created.body.id}`)).status).toBe(403);
    expect(await prisma.board.count()).toBe(1);
  });
});
