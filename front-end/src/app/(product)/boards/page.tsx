import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { BoardsList } from "@/components/boards/BoardsList";
import { NewBoardButton } from "@/components/landing/NewBoardButton";

export const metadata: Metadata = {
  title: "My boards",
  // Your board list is yours.
  robots: { index: false, follow: false },
};

/**
 * A product surface, so it wears the slim board chrome rather than the
 * marketing header and footer (§13 scope note).
 */
export default function BoardsPage() {
  return (
    <div className="min-h-dvh bg-canvas">
      <header className="flex h-14 items-center gap-3 border-b border-border bg-surface px-4">
        <Link
          href="/"
          className="wordmark rounded-sm text-md text-ink focus-visible:focus-ring"
        >
          skrivle
        </Link>
        <h1 className="text-sm font-medium text-ink">My boards</h1>
        <div className="ml-auto">
          <NewBoardButton size="sm">New board</NewBoardButton>
        </div>
      </header>

      <main className="mx-auto w-full max-w-(--container-marketing) px-4 py-8">
        {/* BoardsList reads ?claim= after an OAuth round trip. */}
        <Suspense fallback={null}>
          <BoardsList />
        </Suspense>
      </main>
    </div>
  );
}
