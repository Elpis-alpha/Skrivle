import type { Metadata } from "next";
import { Suspense } from "react";
import { BoardClient } from "@/components/board/BoardClient";
import { BoardIdInvalid, BoardSkeleton } from "@/components/board/BoardStates";
import { parseBoardRef } from "@/lib/board-id";

export const metadata: Metadata = {
  title: "Board",
  // A board is private to whoever holds the link.
  robots: { index: false, follow: false },
};

/**
 * The id shape is decidable here without a round trip, so a malformed one never
 * costs a request. Everything that needs the session is below, client-side.
 */
export default async function BoardPage({ params }: PageProps<"/board/[id]">) {
  const { id } = await params;
  const parsed = parseBoardRef(id);

  if (!parsed.ok) return <BoardIdInvalid reason={parsed.error} />;

  return (
    <Suspense fallback={<BoardSkeleton />}>
      <BoardClient id={parsed.id} />
    </Suspense>
  );
}
