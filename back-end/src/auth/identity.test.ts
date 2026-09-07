import { beforeEach, describe, expect, it } from "vitest";
import { publicUser, resolveUser, UnverifiedEmailCollision } from "./identity.js";
import { prisma } from "../db/prisma.js";

async function reset() {
  // Identities and collaborators cascade from users.
  await prisma.boardDoc.deleteMany();
  await prisma.board.deleteMany();
  await prisma.user.deleteMany();
}

beforeEach(reset);

const googleProfile = {
  provider: "google" as const,
  providerAccountId: "google-sub-1",
  email: "person@example.com",
  emailVerified: true,
  name: "Person",
  avatarUrl: "https://example.com/a.png",
};

describe("resolveUser", () => {
  it("creates a user and an identity for a first-time sign-in", async () => {
    const user = await resolveUser(googleProfile);

    expect(user.email).toBe("person@example.com");
    expect(user.name).toBe("Person");
    const identities = await prisma.identity.findMany({ where: { userId: user.id } });
    expect(identities).toHaveLength(1);
    expect(identities[0]).toMatchObject({ provider: "google", providerAccountId: "google-sub-1" });
  });

  it("returns the same user when the same provider account signs in again", async () => {
    const first = await resolveUser(googleProfile);
    const second = await resolveUser(googleProfile);

    expect(second.id).toBe(first.id);
    expect(await prisma.user.count()).toBe(1);
    expect(await prisma.identity.count()).toBe(1);
  });

  it("links a second provider to one user when the address is verified", async () => {
    // The headline behaviour: Google today, GitHub tomorrow, same boards.
    const viaGoogle = await resolveUser(googleProfile);
    const viaGithub = await resolveUser({
      provider: "github",
      providerAccountId: "gh-99",
      email: "person@example.com",
      emailVerified: true,
      name: "Person",
    });

    expect(viaGithub.id).toBe(viaGoogle.id);
    expect(await prisma.user.count()).toBe(1);
    expect(await prisma.identity.count()).toBe(2);
  });

  it("links an email one-time-code sign-in to an existing OAuth user", async () => {
    const viaGoogle = await resolveUser(googleProfile);
    const viaEmail = await resolveUser({
      provider: "email",
      providerAccountId: "person@example.com",
      email: "person@example.com",
      emailVerified: true,
      name: "person",
    });

    expect(viaEmail.id).toBe(viaGoogle.id);
    expect(await prisma.user.count()).toBe(1);
  });

  it("refuses to link an UNVERIFIED address to an existing account", async () => {
    // The account-takeover branch. A provider that lets anyone type
    // person@example.com into their profile must not hand over that account.
    await resolveUser(googleProfile);

    await expect(
      resolveUser({
        provider: "github",
        providerAccountId: "attacker-1",
        email: "person@example.com",
        emailVerified: false,
        name: "Not Person",
      }),
    ).rejects.toBeInstanceOf(UnverifiedEmailCollision);

    expect(await prisma.user.count()).toBe(1);
    expect(await prisma.identity.count()).toBe(1);
  });

  it("still creates an account for an unverified address nobody else holds", async () => {
    const user = await resolveUser({
      provider: "github",
      providerAccountId: "gh-solo",
      email: "solo@example.com",
      emailVerified: false,
      name: "Solo",
    });
    expect(user.email).toBe("solo@example.com");
  });

  it("normalises the address, so casing cannot create a duplicate", async () => {
    const lower = await resolveUser(googleProfile);
    const upper = await resolveUser({
      provider: "github",
      providerAccountId: "gh-case",
      email: "PERSON@EXAMPLE.COM",
      emailVerified: true,
      name: "Person",
    });

    expect(upper.id).toBe(lower.id);
    expect(await prisma.user.count()).toBe(1);
  });

  it("backfills a missing avatar but never overwrites an existing one", async () => {
    const created = await resolveUser({ ...googleProfile, avatarUrl: undefined });
    expect(created.avatarUrl).toBeNull();

    const linked = await resolveUser({
      provider: "github",
      providerAccountId: "gh-avatar",
      email: "person@example.com",
      emailVerified: true,
      name: "Person",
      avatarUrl: "https://example.com/github.png",
    });
    expect(linked.avatarUrl).toBe("https://example.com/github.png");

    const third = await resolveUser({
      provider: "email",
      providerAccountId: "person@example.com",
      email: "person@example.com",
      emailVerified: true,
      name: "Person",
      avatarUrl: "https://example.com/other.png",
    });
    expect(third.avatarUrl).toBe("https://example.com/github.png");
  });

  it("falls back to the address local-part when the provider sends no name", async () => {
    const user = await resolveUser({ ...googleProfile, name: "   " });
    expect(user.name).toBe("person");
  });
});

describe("publicUser", () => {
  it("exposes only the fields the browser needs", async () => {
    const user = await resolveUser(googleProfile);
    expect(Object.keys(publicUser(user)).sort()).toEqual(["avatarUrl", "email", "id", "name"]);
  });
});
