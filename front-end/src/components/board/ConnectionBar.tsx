"use client";

// STYLE_GUIDE.md §10.21 — "Reconnecting…" is a slim bar in the chrome stack.
// It never blocks or overlays the canvas: you can keep drawing offline, and
// Yjs reconciles when the socket comes back.

import type { ConnectionStatus } from "@/lib/realtime/board-session";

export function ConnectionBar({ status }: { status: ConnectionStatus }) {
  if (status !== "reconnecting") return null;

  return (
    <div
      role="status"
      className="shrink-0 bg-warning-subtle px-4 py-1 text-2xs font-medium text-warning-strong"
    >
      Reconnecting… your changes are saved locally and will sync when you&apos;re back.
    </div>
  );
}
