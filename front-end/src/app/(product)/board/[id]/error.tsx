"use client";

// Without this, a render error anywhere on the board blanks the whole page.
// `retry` refreshes the route and remounts the board, which reconnects it.

import { useEffect } from "react";
import { BoardCrashed } from "@/components/board/BoardStates";
import { reportError } from "@/lib/report-error";

export default function BoardError({ error, retry }: { error: unknown; retry: () => void }) {
  // Next only logs a caught error to the visitor's console.
  useEffect(() => reportError(error, "boundary"), [error]);

  return <BoardCrashed onReload={retry} />;
}
