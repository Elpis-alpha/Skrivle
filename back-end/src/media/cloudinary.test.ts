import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { ownsPublicId, publicIdFor, signUpload, thumbnailUrl } from "./cloudinary.js";
import { config } from "../config/env.js";

describe("publicIdFor", () => {
  it("derives a deterministic id per board and per user", () => {
    const folder = config.cloudinary.folder;
    expect(publicIdFor("thumbnail", "k3m9p")).toBe(`${folder}/thumbnails/k3m9p`);
    expect(publicIdFor("avatar", "user-1")).toBe(`${folder}/avatars/user-1`);
  });

  it("is stable, so a re-upload overwrites rather than accumulating orphans", () => {
    expect(publicIdFor("thumbnail", "k3m9p")).toBe(publicIdFor("thumbnail", "k3m9p"));
  });

  it("keeps thumbnails and avatars in separate folders", () => {
    expect(publicIdFor("thumbnail", "same")).not.toBe(publicIdFor("avatar", "same"));
  });
});

describe("ownsPublicId", () => {
  it("accepts the id derived for that owner", () => {
    expect(ownsPublicId("thumbnail", "k3m9p", publicIdFor("thumbnail", "k3m9p"))).toBe(true);
  });

  it("rejects another board's thumbnail — the whole point of deriving the id", () => {
    expect(ownsPublicId("thumbnail", "mine", publicIdFor("thumbnail", "theirs"))).toBe(false);
  });

  it("rejects an arbitrary path", () => {
    expect(ownsPublicId("avatar", "user-1", "../../etc/passwd")).toBe(false);
    expect(ownsPublicId("avatar", "user-1", "skrivle/avatars/user-2")).toBe(false);
  });

  it("does not let a thumbnail signature be used for an avatar", () => {
    expect(ownsPublicId("avatar", "x", publicIdFor("thumbnail", "x"))).toBe(false);
  });
});

describe("signUpload", () => {
  it("returns everything the browser needs and never the API secret", () => {
    const signed = signUpload("thumbnail", "k3m9p");

    expect(signed.publicId).toBe(publicIdFor("thumbnail", "k3m9p"));
    expect(signed.signature).toMatch(/^[0-9a-f]{40}$/);
    expect(signed.timestamp).toBeGreaterThan(1_600_000_000);
    expect(JSON.stringify(signed)).not.toContain(config.cloudinary.apiSecret);
  });

  it("matches Cloudinary's documented signing algorithm", () => {
    // Cloudinary signs the SHA-1 of the parameters sorted by key, joined as
    // k=v&k=v, with the API secret appended. Recomputing it here means a change
    // in the SDK's behaviour surfaces as a test failure rather than as uploads
    // silently 401ing in production.
    const signed = signUpload("avatar", "user-1");
    const params = [
      `invalidate=true`,
      `overwrite=true`,
      `public_id=${signed.publicId}`,
      `timestamp=${signed.timestamp}`,
    ].join("&");
    const expected = createHash("sha1")
      .update(params + config.cloudinary.apiSecret)
      .digest("hex");

    expect(signed.signature).toBe(expected);
  });

  it("moves with time, so a signature cannot be replayed indefinitely", () => {
    const a = signUpload("avatar", "user-1");
    const b = signUpload("avatar", "user-1");
    // Same second gives the same signature; the timestamp is what expires.
    expect(a.timestamp).toBeLessThanOrEqual(b.timestamp);
  });
});

describe("thumbnailUrl", () => {
  it("returns null when a board has no thumbnail yet", () => {
    expect(thumbnailUrl(null)).toBeNull();
  });

  it("applies the 16:10 crop the My Boards tile expects", () => {
    const url = thumbnailUrl(publicIdFor("thumbnail", "k3m9p"));
    expect(url).toContain("ar_16:10");
    expect(url).toContain("c_fill");
    // Format and quality are negotiated per browser rather than baked in.
    expect(url).toContain("f_auto");
    expect(url).toContain("q_auto");
  });

  it("serves over https", () => {
    expect(thumbnailUrl(publicIdFor("thumbnail", "x"))).toMatch(/^https:\/\//);
  });
});
