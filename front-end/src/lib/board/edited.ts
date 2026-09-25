// "edited 2h ago" on a My Boards tile (STYLE_GUIDE §10.15).
//
// The time is the board's updatedAt, which the back-end bumps with every
// canvas snapshot as well as on a rename — so it tracks drawing, not just
// the board's metadata.

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** Past a week, a count of days reads worse than the date. */
const RELATIVE_FOR = 7 * DAY;

export function formatEdited(updatedAt: string, now: number = Date.now()): string {
  const at = new Date(updatedAt);
  const since = now - at.getTime();

  if (Number.isNaN(since)) return "";
  if (since < MINUTE) return "edited just now";
  if (since < HOUR) return `edited ${Math.floor(since / MINUTE)}m ago`;
  if (since < DAY) return `edited ${Math.floor(since / HOUR)}h ago`;
  if (since < RELATIVE_FOR) return `edited ${Math.floor(since / DAY)}d ago`;

  const thisYear = at.getFullYear() === new Date(now).getFullYear();
  const date = at.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    ...(thisYear ? {} : { year: "numeric" }),
  });
  return `edited ${date}`;
}
