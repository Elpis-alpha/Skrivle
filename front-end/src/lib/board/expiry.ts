// Countdown copy for the guest-board expiry chip (STYLE_GUIDE §4.2).

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;

/**
 * "Expires in 23h" / "Expires in 48m" / "Expires in under a minute".
 *
 * Deliberately coarse: the chip re-renders once a minute, so seconds would be
 * wrong more often than right.
 */
export function formatRemaining(
  expiresAt: string,
  now: number = Date.now(),
): string {
  const remaining = new Date(expiresAt).getTime() - now;

  if (Number.isNaN(remaining)) return "Expires soon";
  if (remaining <= 0) return "Expired";
  if (remaining < MINUTE) return "Expires in under a minute";
  if (remaining < HOUR) return `Expires in ${Math.floor(remaining / MINUTE)}m`;
  return `Expires in ${Math.floor(remaining / HOUR)}h`;
}
