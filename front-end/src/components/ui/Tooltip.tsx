"use client";

// STYLE_GUIDE.md §10.19 — a dark chip, even in light mode.
//
// Never contains interactive content, so it is labelled rather than focusable.

import { useEffect, useRef, useState } from "react";

const OPEN_DELAY = 120;

/**
 * §10.19 — "no delay between adjacent targets".
 *
 * Shared across every tooltip on the page: once one has been open, moving along
 * a row of icon buttons shows the next immediately rather than making the user
 * wait out the delay eight times.
 */
let warmUntil = 0;
const WARM_MS = 300;

export function Tooltip({
  label,
  children,
  className = "",
}: {
  label: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const show = () => {
    if (timer.current) clearTimeout(timer.current);
    if (Date.now() < warmUntil) {
      setOpen(true);
      return;
    }
    timer.current = setTimeout(() => setOpen(true), OPEN_DELAY);
  };

  const hide = () => {
    if (timer.current) clearTimeout(timer.current);
    setOpen((wasOpen) => {
      if (wasOpen) warmUntil = Date.now() + WARM_MS;
      return false;
    });
  };

  return (
    <span
      className={`relative inline-flex ${className}`}
      onPointerEnter={show}
      onPointerLeave={hide}
      onFocus={show}
      onBlur={hide}
    >
      {children}
      {open ? (
        <span
          role="tooltip"
          className={
            "pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 -translate-x-1/2 " +
            "whitespace-nowrap rounded-sm bg-ink px-2 py-1.5 text-xs text-white " +
            "dark:bg-surface-raised dark:text-ink"
          }
        >
          {label}
        </span>
      ) : null}
    </span>
  );
}
