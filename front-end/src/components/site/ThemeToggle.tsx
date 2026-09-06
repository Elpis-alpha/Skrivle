"use client";

// Writes the same key the boot script in layout.tsx reads, so a choice made
// here survives the next load without a flash of the wrong theme.
//
// The theme lives on <html data-theme>, not in React, so this subscribes to it
// rather than mirroring it into state. That keeps every toggle on the page —
// header and footer — showing the same thing.

import { Moon, Sun } from "lucide-react";
import { useSyncExternalStore } from "react";

const STORAGE_KEY = "skrivle-theme";

function subscribe(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-theme"],
  });
  return () => observer.disconnect();
}

function getTheme() {
  return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
}

// On the server the theme is genuinely unknown — the boot script hasn't run.
function getServerTheme() {
  return null;
}

export function ThemeToggle({ className = "" }: { className?: string }) {
  const theme = useSyncExternalStore(subscribe, getTheme, getServerTheme);
  const dark = theme === "dark";

  function toggle() {
    const next = dark ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Private mode or storage disabled — the choice just won't persist.
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={dark ? "Switch to light theme" : "Switch to dark theme"}
      className={
        "inline-flex size-9 items-center justify-center rounded-sm text-ink-secondary " +
        "transition-colors duration-(--dur-fast) ease-standard " +
        "hover:bg-wg-50 hover:text-ink focus-visible:focus-ring " +
        "pointer-coarse:size-11 " +
        className
      }
    >
      {dark ? (
        <Sun size={20} strokeWidth={1.5} aria-hidden="true" />
      ) : (
        <Moon size={20} strokeWidth={1.5} aria-hidden="true" />
      )}
    </button>
  );
}
