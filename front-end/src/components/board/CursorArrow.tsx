// STYLE_GUIDE.md §10.10 — the arrow and name tag, shared by the real board and
// the landing page's mock so the two can't drift apart.
//
// The arrow always carries a 1.5px surface outline so any hue reads on any
// ground, and the name always accompanies the colour (§2.6): hue is never the
// only identifier.

import type { CursorColor } from "@/lib/presence-colors";

export function CursorArrow({
  color,
  name,
  /** Fades with idle time on a live board; always 1 in the mock. */
  labelOpacity,
  labelRef,
}: {
  color: CursorColor;
  name: string;
  labelOpacity?: number;
  labelRef?: React.Ref<HTMLSpanElement>;
}) {
  return (
    <div className="flex items-start">
      <svg width="18" height="20" viewBox="0 0 18 20" aria-hidden="true" focusable="false">
        <path
          d="M2 1.5 15.5 11 9 11.8 5.8 17.8Z"
          fill={color.base}
          stroke="var(--surface)"
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
      </svg>
      <span
        ref={labelRef}
        className="mt-1 -ml-0.5 rounded-pill px-1.5 py-0.5 text-2xs font-medium whitespace-nowrap text-white transition-opacity duration-(--dur-fast) ease-standard"
        style={{
          backgroundColor: color.label,
          ...(labelOpacity === undefined ? {} : { opacity: labelOpacity }),
        }}
      >
        {name}
      </span>
    </div>
  );
}
