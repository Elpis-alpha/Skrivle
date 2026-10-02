"use client";

// STYLE_GUIDE.md §10.21 — "Reconnecting…" is a slim bar in the chrome stack.
// It never blocks or overlays the canvas: you can keep drawing offline, and
// Yjs reconciles when the socket comes back. On recovery the bar clears and a
// toast says "Back online".

import { useEffect, useRef } from "react";
import { useToast } from "@/components/ui/Toast";
import type { ConnectionStatus } from "@/lib/realtime/board-session";

export function ConnectionBar({
  status,
  savedLocally,
}: {
  status: ConnectionStatus;
  /** Whether changes are being kept in this browser (lib/realtime/local-copy.ts). */
  savedLocally: boolean;
}) {
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

  // Only called saved where it is. A browser that can't keep a copy holds
  // unsynced work in this tab's memory and nowhere else, so there the bar says
  // to keep the tab instead.
  return (
    <div
      role="status"
      className="shrink-0 bg-warning-subtle px-4 py-1 text-2xs font-medium text-warning-strong"
    >
      {savedLocally
        ? "Reconnecting… your changes are saved on this device and will sync when you're back."
        : "Reconnecting… your changes will sync when you're back, so keep this tab open."}
    </div>
  );
}
