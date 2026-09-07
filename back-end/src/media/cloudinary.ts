// Cloudinary: board thumbnails and uploaded avatars.
//
// Uploads go **directly from the browser to Cloudinary**, authorised by a
// signature this server mints. Nothing multipart passes through Express — no
// multer, no temp files, and no multi-megabyte PNG sitting in Node's heap for
// every board that saves a thumbnail. The API secret never leaves the server;
// only the derived, scoped, short-lived signature does.
import { v2 as cloudinary } from "cloudinary";
import { config, featureEnabled } from "../config/env.js";

cloudinary.config({
  cloud_name: config.cloudinary.cloudName,
  api_key: config.cloudinary.apiKey,
  api_secret: config.cloudinary.apiSecret,
  secure: true,
});

/** How long a minted upload signature stays usable. */
export const SIGNATURE_TTL_SECONDS = 3600;

export type AssetKind = "thumbnail" | "avatar";

/**
 * Deterministic public ids.
 *
 * Making the id a pure function of the board or user means an upload overwrites
 * the previous asset rather than accumulating orphans, and it is what lets the
 * confirm endpoint verify a claimed public_id without a round trip to
 * Cloudinary: a caller can only name the asset they are already allowed to
 * write.
 */
export function publicIdFor(kind: AssetKind, ownerId: string): string {
  const folder = config.cloudinary.folder;
  return kind === "thumbnail" ? `${folder}/thumbnails/${ownerId}` : `${folder}/avatars/${ownerId}`;
}

export type UploadSignature = {
  cloudName: string;
  apiKey: string;
  timestamp: number;
  signature: string;
  publicId: string;
};

/**
 * Sign an upload the browser will perform.
 *
 * `overwrite` plus `invalidate` means the delivery CDN drops the old version
 * rather than serving a stale thumbnail after a board changes.
 */
export function signUpload(kind: AssetKind, ownerId: string): UploadSignature {
  const timestamp = Math.floor(Date.now() / 1000);
  const publicId = publicIdFor(kind, ownerId);

  // The parameter set is signed exactly as sent; the browser must post these
  // same values or Cloudinary rejects the upload.
  const params = {
    public_id: publicId,
    timestamp,
    overwrite: true,
    invalidate: true,
  };

  return {
    cloudName: config.cloudinary.cloudName,
    apiKey: config.cloudinary.apiKey,
    timestamp,
    signature: cloudinary.utils.api_sign_request(params, config.cloudinary.apiSecret),
    publicId,
  };
}

/**
 * Delivery URL for a board thumbnail.
 *
 * The 16:10 crop (STYLE_GUIDE §10.15) is a delivery transformation rather than
 * something baked in at upload, so the stored original stays reusable if the
 * tile size ever changes. f_auto/q_auto let Cloudinary pick format and quality
 * per browser.
 */
export function thumbnailUrl(publicId: string | null): string | null {
  if (!publicId || !featureEnabled.cloudinary) return null;
  return cloudinary.url(publicId, {
    secure: true,
    transformation: [{ crop: "fill", aspect_ratio: "16:10", width: 480, gravity: "north_west" }, { fetch_format: "auto", quality: "auto" }],
  });
}

/** Delivery URL for an uploaded avatar — square, face-aware. */
export function avatarUrl(publicId: string | null): string | null {
  if (!publicId || !featureEnabled.cloudinary) return null;
  return cloudinary.url(publicId, {
    secure: true,
    transformation: [{ crop: "fill", width: 128, height: 128, gravity: "face" }, { fetch_format: "auto", quality: "auto" }],
  });
}

/**
 * Remove assets. Called when a board is deleted or swept, so Cloudinary does
 * not accumulate images for boards that no longer exist.
 *
 * Never throws: losing a board because its thumbnail could not be deleted would
 * be the wrong trade.
 */
export async function deleteAssets(publicIds: string[]): Promise<void> {
  if (publicIds.length === 0 || !featureEnabled.cloudinary) return;
  try {
    await cloudinary.api.delete_resources(publicIds);
  } catch (err) {
    console.error(
      "[skrivle] Cloudinary cleanup failed:",
      err instanceof Error ? err.message : err,
    );
  }
}

/** Whether a claimed public id is one this owner is allowed to have written. */
export function ownsPublicId(kind: AssetKind, ownerId: string, publicId: string): boolean {
  return publicId === publicIdFor(kind, ownerId);
}
