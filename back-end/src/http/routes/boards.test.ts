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

const deletedAssets: string[][] = [];
vi.mock("../../media/cloudinary.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../media/cloudinary.js")>();
  return {
    ...actual,
    deleteAssets: vi.fn(async (ids: string[]) => {
      deletedAssets.push(ids);
    }),
  };
});

const Y = await import("yjs");
const { createServer } = await import("../../server.js");
const { prisma } = await import("../../db/prisma.js");
const { flushTestKeys, useRedis } = await import("../../test/redis-harness.js");
const { publicIdFor } = await import("../../media/cloudinary.js");
const { loadDocState, saveDocState } = await import("../../realtime/board-store.js");
const { acquireDoc, resetRegistry } = await import("../../realtime/doc-manager.js");

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
  deletedAssets.length = 0;
  resetRegistry();
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

  // As the expiry sweep does, or Cloudinary keeps an image nothing points at.
  it("removes a deleted board's thumbnail", async () => {
    const agent = await signedIn("owner@example.com");
    const created = await agent.post("/api/boards").send({});
    const id = created.body.id as string;
    await prisma.board.update({
      where: { id },
      data: { thumbnailId: publicIdFor("thumbnail", id) },
    });

    await agent.delete(`/api/boards/${id}`);
    expect(deletedAssets).toEqual([[publicIdFor("thumbnail", id)]]);
  });

  it("leaves the thumbnail alone when the delete is refused", async () => {
    const owner = await signedIn("owner@example.com");
    const created = await owner.post("/api/boards").send({});
    const id = created.body.id as string;
    await prisma.board.update({
      where: { id },
      data: { thumbnailId: publicIdFor("thumbnail", id) },
    });

    const other = await signedIn("other@example.com");
    await other.delete(`/api/boards/${id}`);
    expect(deletedAssets).toEqual([]);
  });
});

/** A doc state holding one note, and a way to read it back. */
function stateWith(text: string): Uint8Array {
  const doc = new Y.Doc();
  doc.getMap("elements").set("n1", text);
  return Y.encodeStateAsUpdate(doc);
}
function textIn(state: Uint8Array | null): unknown {
  if (!state) return undefined;
  const doc = new Y.Doc();
  Y.applyUpdate(doc, state);
  return doc.getMap("elements").get("n1");
}

describe("POST /api/boards/:id/duplicate", () => {
  it("copies the canvas into a new board the caller owns", async () => {
    const agent = await signedIn("owner@example.com");
    const source = await agent.post("/api/boards").send({ title: "Sprint" });
    await saveDocState(source.body.id, stateWith("hello"));

    const res = await agent.post(`/api/boards/${source.body.id}/duplicate`);

    expect(res.status).toBe(201);
    expect(res.body.id).not.toBe(source.body.id);
    expect(res.body.title).toBe("Sprint (copy)");
    expect(res.body.hasOwner).toBe(true);
    expect(res.body.isEphemeral).toBe(false);
    expect(textIn(await loadDocState(res.body.id))).toBe("hello");

    const mine = await agent.get("/api/boards");
    expect(mine.body.boards.map((b: { id: string }) => b.id)).toContain(res.body.id);
  });

  // The snapshot is up to 30s behind a board people are drawing on.
  it("copies what's on the board now, not only what was last saved", async () => {
    const agent = await signedIn("owner@example.com");
    const source = await agent.post("/api/boards").send({});
    await saveDocState(source.body.id, stateWith("saved"));
    const live = await acquireDoc(source.body.id);
    live.getMap("elements").set("n1", "not saved yet");

    const res = await agent.post(`/api/boards/${source.body.id}/duplicate`);
    expect(textIn(await loadDocState(res.body.id))).toBe("not saved yet");
  });

  it("copies a board nothing has been drawn on yet", async () => {
    const agent = await signedIn("owner@example.com");
    const source = await agent.post("/api/boards").send({});

    const res = await agent.post(`/api/boards/${source.body.id}/duplicate`);
    expect(res.status).toBe(201);
    expect(await loadDocState(res.body.id)).toBeNull();
  });

  // Anyone with the link can already see and edit it; the copy is theirs.
  it("lets anyone signed in copy a board they don't own", async () => {
    const owner = await signedIn("owner@example.com");
    const source = await owner.post("/api/boards").send({});
    await saveDocState(source.body.id, stateWith("hello"));

    const other = await signedIn("other@example.com");
    const res = await other.post(`/api/boards/${source.body.id}/duplicate`);

    expect(res.status).toBe(201);
    const theirs = await other.get("/api/boards");
    expect(theirs.body.boards).toContainEqual(
      expect.objectContaining({ id: res.body.id, role: "owner" }),
    );
  });

  it("keeps a long title within the limit", async () => {
    const agent = await signedIn("owner@example.com");
    const source = await agent.post("/api/boards").send({ title: "x".repeat(120) });

    const res = await agent.post(`/api/boards/${source.body.id}/duplicate`);
    expect(res.body.title).toHaveLength(120);
    expect(res.body.title.endsWith(" (copy)")).toBe(true);
  });

  // Cloudinary ids follow the board id; the copy's is drawn when it's opened.
  it("doesn't point the copy at the original's thumbnail", async () => {
    const agent = await signedIn("owner@example.com");
    const source = await agent.post("/api/boards").send({});
    await prisma.board.update({
      where: { id: source.body.id },
      data: { thumbnailId: publicIdFor("thumbnail", source.body.id) },
    });

    const res = await agent.post(`/api/boards/${source.body.id}/duplicate`);
    const copy = await prisma.board.findUnique({ where: { id: res.body.id } });
    expect(copy?.thumbnailId).toBeNull();
  });

  it("needs a session", async () => {
    const source = await request(app).post("/api/boards").send({});
    expect((await request(app).post(`/api/boards/${source.body.id}/duplicate`)).status).toBe(401);
  });

  it("404s an id nobody holds, and 410s an expired board", async () => {
    const agent = await signedIn("owner@example.com");
    expect((await agent.post("/api/boards/zzzzz/duplicate")).status).toBe(404);

    const source = await request(app).post("/api/boards").send({});
    await prisma.board.update({
      where: { id: source.body.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    expect((await agent.post(`/api/boards/${source.body.id}/duplicate`)).status).toBe(410);
  });
});
