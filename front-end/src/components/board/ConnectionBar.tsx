"use client";

// STYLE_GUIDE.md §10.21 — "Reconnecting…" is a slim bar in the chrome stack.
// It never blocks or overlays the canvas: you can keep drawing offline, and
// Yjs reconciles when the socket comes back. On recovery the bar clears and a
// toast says "Back online".

import { useEffect, useRef } from "react";
import { useToast } from "@/components/ui/Toast";
import type { ConnectionStatus } from "@/lib/realtime/board-session";

export function ConnectionBar({ status }: { status: ConnectionStatus }) {
  const toast = useToast();
  const last = useRef(status);

  // Only coming back from "reconnecting" is news: not the first connection,
  // and not the second "connected" that arrives once the board is joined.
  useEffect(() => {
    if (last.current === "reconnecting" && status === "connected") {
      toast.show("Back online", { tone: "success" });
    }
    last.current = status;
  }, [status, toast]);

  if (status !== "reconnecting") return null;

  // Unsynced work lives in this tab's memory until the socket is back, so the
  // bar says to keep the tab rather than calling it saved.
  return (
    <div
      role="status"
      className="shrink-0 bg-warning-subtle px-4 py-1 text-2xs font-medium text-warning-strong"
    >
      Reconnecting… your changes will sync when you&apos;re back, so keep this tab open.
    </div>
  );
}
