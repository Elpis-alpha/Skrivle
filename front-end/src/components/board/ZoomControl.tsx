"use client";

// STYLE_GUIDE.md §10.23 — the zoom control.
//
// A second, smaller piece of the same hardware as the toolbar (§1): pill,
// --surface, --elev-2. Bottom-left on wide screens; top-left below md, where
// the bottom edge belongs to the toolbar and a phone has no room for both.
//
// The readout is the one thing on the board that re-renders as the camera
// moves — viewport.ts keeps the camera out of React precisely so that only
// this does.

import { useSyncExternalStore } from "react";
import { Maximize, Minus, Plus } from "lucide-react";
import { Tooltip } from "@/components/ui/Tooltip";
import type { CameraActions } from "@/lib/board/useCamera";
import { CHROME_ATTR } from "@/lib/board/useBoardGestures";
import type { ViewportStore } from "@/lib/board/viewport";

const BUTTON =
  "grid size-8 place-items-center rounded-pill text-ink-secondary transition-colors " +
  "duration-(--dur-fast) ease-standard hover:bg-wg-50 hover:text-ink focus-visible:focus-ring " +
  "pointer-coarse:size-11";

export function ZoomControl({
  store,
  actions,
}: {
  store: ViewportStore;
  actions: CameraActions;
}) {
  const scale = useSyncExternalStore(
    store.subscribe,
    () => store.getSnapshot().scale,
    () => 1,
  );
  const percent = `${Math.round(scale * 100)}%`;

  return (
    <div
      {...{ [CHROME_ATTR]: "" }}
      role="group"
      aria-label="Zoom"
      className={
        "absolute left-4 flex items-center gap-0.5 rounded-pill border border-border bg-surface p-1 " +
        "shadow-elev-2 max-md:top-3 md:bottom-6"
      }
    >
      <Tooltip label="Zoom out">
        <button type="button" aria-label="Zoom out" onClick={actions.zoomOut} className={BUTTON}>
          <Minus size={16} strokeWidth={1.5} aria-hidden />
        </button>
      </Tooltip>

      <Tooltip
        label={
          <>
            Reset to 100% <kbd className="font-sans text-white/70 dark:text-ink-muted">⇧0</kbd>
          </>
        }
      >
        <button
          type="button"
          aria-label={`Reset zoom to 100%, now ${percent}`}
          onClick={actions.resetZoom}
          className={
            "h-8 min-w-13 rounded-pill px-1.5 text-xs text-ink-secondary tabular-nums transition-colors " +
            "duration-(--dur-fast) ease-standard hover:bg-wg-50 hover:text-ink focus-visible:focus-ring " +
            "pointer-coarse:h-11"
          }
        >
          {percent}
        </button>
      </Tooltip>

      <Tooltip label="Zoom in">
        <button type="button" aria-label="Zoom in" onClick={actions.zoomIn} className={BUTTON}>
          <Plus size={16} strokeWidth={1.5} aria-hidden />
        </button>
      </Tooltip>

      <span className="mx-0.5 h-5 w-px bg-wg-200" aria-hidden />

      <Tooltip
        label={
          <>
            Fit to content <kbd className="font-sans text-white/70 dark:text-ink-muted">⇧1</kbd>
          </>
        }
      >
        <button type="button" aria-label="Fit to content" onClick={actions.fit} className={BUTTON}>
          <Maximize size={16} strokeWidth={1.5} aria-hidden />
        </button>
      </Tooltip>
    </div>
  );
}
