// Board endpoints. back-end/src/http/routes/boards.ts

import { apiFetch } from "./fetch";
import type {
  Board,
  BoardSummary,
  BoardWithRole,
  CreatedBoard,
  UploadSignature,
} from "./types";

/**
 * Signed out: an ephemeral board expiring in 24h, with a one-time creatorToken.
 * Signed in: a permanent board owned by you, creatorToken null.
 *
 * @throws ApiError 409 when a custom id is taken, 400 when it's malformed.
 */
export function createBoard(
  options: { customId?: string; title?: string } = {},
): Promise<CreatedBoard> {
  return apiFetch<CreatedBoard>("/api/boards", {
    method: "POST",
    body: options,
  });
}

/**
 * @throws ApiError 404 when the board never existed, 410 when it existed and
 * expired. The two are distinct states with distinct screens (§10.21).
 */
export function getBoard(
  id: string,
  signal?: AbortSignal,
): Promise<BoardWithRole> {
  return apiFetch<BoardWithRole>(`/api/boards/${encodeURIComponent(id)}`, {
    ...(signal ? { signal } : {}),
  });
}

export function listBoards(
  signal?: AbortSignal,
): Promise<{ boards: BoardSummary[] }> {
  return apiFetch("/api/boards", { ...(signal ? { signal } : {}) });
}

/**
 * Well-formedness *and* uniqueness for a candidate custom id — used to check
 * an id on blur before create is even attempted (STYLE_GUIDE §10.4).
 * Rate-limited at 60/min, so callers must debounce and never call per keystroke.
 */
export function checkBoardIdAvailable(
  id: string,
  signal?: AbortSignal,
): Promise<{ available: boolean }> {
  return apiFetch(`/api/boards/${encodeURIComponent(id)}/available`, {
    ...(signal ? { signal } : {}),
  });
}

/** Needs no session — the creatorToken is the authority. Sets expiry to now + 48h. */
export function extendBoard(
  id: string,
  creatorToken: string,
): Promise<{ expiresAt: string }> {
  return apiFetch(`/api/boards/${encodeURIComponent(id)}/extend`, {
    method: "POST",
    body: { creatorToken },
  });
}

/** Needs both a session and the creatorToken. */
export function claimBoard(id: string, creatorToken: string): Promise<Board> {
  return apiFetch<Board>(`/api/boards/${encodeURIComponent(id)}/claim`, {
    method: "POST",
    body: { creatorToken },
  });
}

/** Owner only. */
export function renameBoard(id: string, title: string): Promise<Board> {
  return apiFetch<Board>(`/api/boards/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: { title },
  });
}

/** Owner only. */
export function deleteBoard(id: string): Promise<void> {
  return apiFetch<void>(`/api/boards/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}

/**
 * Ask for permission to upload this board's thumbnail.
 *
 * Valid for an hour and rate limited to 60/hour/IP, so callers cache it rather
 * than signing per save.
 */
export function signThumbnailUpload(id: string): Promise<UploadSignature> {
  return apiFetch("/api/uploads/signature", {
    method: "POST",
    body: { kind: "thumbnail", boardId: id },
  });
}

/**
 * Tell the server which Cloudinary asset is now this board's thumbnail.
 *
 * The image itself never passes through our API — it goes browser-to-Cloudinary
 * against the signature above, and this is only the confirmation.
 */
export function setBoardThumbnail(
  id: string,
  publicId: string,
): Promise<{ thumbnailUrl: string | null }> {
  return apiFetch(`/api/boards/${encodeURIComponent(id)}/thumbnail`, {
    method: "POST",
    body: { publicId },
  });
}
