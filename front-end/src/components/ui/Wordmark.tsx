// The pen-loop mark (coming-soon/logo.svg) plus the §3.2 wordmark.
// Both strokes are theme tokens, so the mark re-inks itself in dark mode.

export function LogoMark({ className = "size-7" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      <g
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2.75"
        transform="translate(1 2.5)"
      >
        <path
          stroke="var(--ink)"
          d="M16 6c6-.5 10 4 9.5 10S20 26 14 25.5 4.5 19.5 5.5 13.5 10 5.5 14.5 6"
        />
        <path
          stroke="var(--accent)"
          d="M14.5 6C12 5.5 9.7 3.6 8.2 1"
        />
      </g>
    </svg>
  );
}

export function Wordmark({ className = "text-md" }: { className?: string }) {
  return (
    <span className="inline-flex items-center gap-2">
      <LogoMark />
      <span className={`wordmark ${className}`}>skrivle</span>
    </span>
  );
}
