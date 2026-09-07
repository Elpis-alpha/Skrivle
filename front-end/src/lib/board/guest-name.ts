// The display name a signed-out visitor carries onto a board.
//
// Not cosmetic: the gateway computes `user?.name ?? guestName ?? "Guest"`, and
// guestName defaults to "" — which isn't nullish, so the "Guest" fallback never
// fires. An empty auth.name gives every guest a nameless cursor, and
// STYLE_GUIDE §2.6 requires a name beside the colour, never colour alone.
// back-end/src/realtime/gateway.ts

const STORAGE_KEY = "skrivle-guest-name";

/** The server truncates to 40 characters; do it here so what you see is what peers see. */
export const MAX_GUEST_NAME = 40;

export const DEFAULT_GUEST_NAME = "Guest";

export function storedGuestName(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const name = window.localStorage.getItem(STORAGE_KEY)?.trim();
    return name ? name.slice(0, MAX_GUEST_NAME) : null;
  } catch {
    return null;
  }
}

export function rememberGuestName(name: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, name.trim().slice(0, MAX_GUEST_NAME));
  } catch {
    // Storage disabled. They stay "Guest" for this visit.
  }
}

/** Never returns an empty string — see the note at the top of this file. */
export function displayNameFor(user: { name: string } | null): string {
  if (user?.name.trim()) return user.name.trim().slice(0, MAX_GUEST_NAME);
  return storedGuestName() ?? DEFAULT_GUEST_NAME;
}
