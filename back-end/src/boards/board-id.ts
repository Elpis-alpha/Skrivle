// Board identity rules — docs/ARCHITECTURE.md#board-identity.
// Mirrors front-end/src/lib/board-id.ts; keep the two in sync.
import { randomBytes } from "node:crypto";

const DEFAULT_ID_LENGTH = 5;

// No vowels and no look-alike glyphs (0/O, 1/I/l), so a generated id is safe to
// read aloud and can't spell anything unfortunate.
export const ID_ALPHABET = "bcdfghjkmnpqrstvwxyz23456789";

/** A custom id: alphanumeric plus hyphens, 3–32 characters. */
export const ID_PATTERN = /^[a-zA-Z0-9-]{3,32}$/;

// 256 is not a multiple of the 28-character alphabet, so mapping a raw byte
// with `% 28` would make the first four letters ~14% likelier than the rest.
// Bytes at or above the largest exact multiple are discarded instead, which
// makes every character equally likely.
const REJECTION_CEILING = Math.floor(256 / ID_ALPHABET.length) * ID_ALPHABET.length;

/** Generate a random board id from the unambiguous alphabet. */
export function generateBoardId(length: number = DEFAULT_ID_LENGTH): string {
  let id = "";
  while (id.length < length) {
    // Over-fetch: on average only ~1.6% of bytes are rejected, so one batch
    // almost always suffices, and a short read simply loops.
    for (const byte of randomBytes(length * 2)) {
      if (byte >= REJECTION_CEILING) continue;
      id += ID_ALPHABET[byte % ID_ALPHABET.length];
      if (id.length === length) break;
    }
  }
  return id;
}

/**
 * Board ids are compared case-insensitively.
 *
 * Postgres text comparison is case-sensitive, so without normalising on both
 * write and lookup, "Sprint-Planning" and "sprint-planning" would be two
 * different boards — and a shared link that got title-cased by a chat client
 * would land on a board that does not exist.
 */
export function normalizeBoardId(id: string): string {
  return id.trim().toLowerCase();
}

/**
 * Whether a user-chosen custom id is well-formed. Uniqueness is a separate
 * check against the database.
 */
export function isValidCustomId(id: string): boolean {
  return ID_PATTERN.test(id.trim());
}

/**
 * Mint a generated board id that isn't already taken.
 *
 * The check is advisory, not a lock: two requests can clear it with the same id
 * before either inserts. The caller must still treat a unique-constraint
 * violation on insert as a collision and retry — see boards/service.ts.
 */
export async function mintUniqueBoardId(
  exists: (id: string) => Promise<boolean> = async () => false,
  length: number = DEFAULT_ID_LENGTH,
): Promise<string> {
  for (let attempt = 0; attempt < 10; attempt++) {
    const id = generateBoardId(length);
    if (!(await exists(id))) return id;
  }
  throw new Error("Could not mint a unique board id after 10 attempts.");
}
