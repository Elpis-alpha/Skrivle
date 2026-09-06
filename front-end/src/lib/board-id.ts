// Board identity rules — docs/ARCHITECTURE.md#board-identity.
//
// Default id: 5 alphanumeric characters. Optional custom id: a unique string
// chosen at creation, immutable afterwards.

const DEFAULT_ID_LENGTH = 5;

// No vowels and no look-alike glyphs (0/O, 1/I/l), so a generated id is safe to
// read aloud and can't spell anything unfortunate.
const ID_ALPHABET = "bcdfghjkmnpqrstvwxyz23456789";

/** A custom id: alphanumeric plus hyphens, 3–32 characters. */
const ID_PATTERN = /^[a-zA-Z0-9-]{3,32}$/;

/**
 * PLACEHOLDER — Phase 1 swap point.
 *
 * ARCHITECTURE.md specifies that ids are generated server-side and
 * collision-checked. Until the back-end exists, the landing page mints one
 * client-side so the "New board" CTA leads somewhere real. Replace this with
 * the create-board API call; keep `parseBoardRef` as-is.
 */
export function generateBoardId(length: number = DEFAULT_ID_LENGTH): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let id = "";
  for (const byte of bytes) id += ID_ALPHABET[byte % ID_ALPHABET.length];
  return id;
}

export type ParseResult =
  | { ok: true; id: string }
  | { ok: false; error: string };

/**
 * Accepts what someone actually pastes: a bare id (`k3m9p`), a full board URL
 * (`https://skrivle.elpis.cc/board/k3m9p`), or a path (`/board/k3m9p`).
 *
 * Error messages name the fix, per STYLE_GUIDE.md §10.3.
 */
export function parseBoardRef(input: string): ParseResult {
  const trimmed = input.trim();
  if (!trimmed) return { ok: false, error: "Enter a board link or id." };

  let candidate = trimmed;

  // Pull the id out of anything URL-shaped: a full link, a host-relative path,
  // or a hostname with no protocol.
  if (candidate.includes("/")) {
    let path: string;
    if (candidate.startsWith("/")) {
      // A bare path — strip any query or hash by hand rather than inventing a host.
      path = candidate.split(/[?#]/)[0];
    } else {
      const withProtocol = /^https?:\/\//i.test(candidate)
        ? candidate
        : `https://${candidate}`;
      try {
        path = new URL(withProtocol).pathname;
      } catch {
        return { ok: false, error: "That doesn't look like a board link." };
      }
    }
    const match = path.match(/\/board\/([^/?#]+)\/?$/);
    if (!match) {
      return { ok: false, error: "That link has no board id in it." };
    }
    candidate = decodeURIComponent(match[1]);
  }

  if (!ID_PATTERN.test(candidate)) {
    return {
      ok: false,
      error: "Board ids are 3–32 letters, numbers, or hyphens.",
    };
  }

  return { ok: true, id: candidate };
}
