// Board identity rules — docs/ARCHITECTURE.md#board-identity.
// Mirrors front-end/src/lib/board-id.ts; keep the two in sync. The front-end
// mints ids client-side only until this server exists (see its PLACEHOLDER note).

const DEFAULT_ID_LENGTH = 5;

// No vowels and no look-alike glyphs (0/O, 1/I/l), so a generated id is safe to
// read aloud and can't spell anything unfortunate.
export const ID_ALPHABET = "bcdfghjkmnpqrstvwxyz23456789";

/** A custom id: alphanumeric plus hyphens, 3–32 characters. */
export const ID_PATTERN = /^[a-zA-Z0-9-]{3,32}$/;

/** Generate a random board id from the unambiguous alphabet. */
export function generateBoardId(length: number = DEFAULT_ID_LENGTH): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let id = "";
  for (const byte of bytes) id += ID_ALPHABET[byte % ID_ALPHABET.length];
  return id;
}

/**
 * Whether a user-chosen custom id is well-formed. Uniqueness is a separate
 * check against the database.
 */
export function isValidCustomId(id: string): boolean {
  return ID_PATTERN.test(id);
}

/**
 * Mint a generated board id that isn't already taken.
 *
 * TODO(Phase 1): the caller passes a real existence check backed by Prisma
 * (`(id) => prisma.board.findUnique({ where: { id } }).then(Boolean)`).
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
