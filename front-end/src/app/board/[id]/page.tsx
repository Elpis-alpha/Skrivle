import type { Metadata } from "next";
import { PageShell } from "@/components/site/PageShell";
import { Button } from "@/components/ui/Button";
import { parseBoardRef } from "@/lib/board-id";

export const metadata: Metadata = {
  title: "Board",
  // A board is private to whoever holds the link.
  robots: { index: false, follow: false },
};

/**
 * Placeholder for the canvas. The route exists so the landing page's CTAs lead
 * somewhere real; Phase 1 replaces this body with the board itself.
 */
export default async function BoardPage({ params }: PageProps<"/board/[id]">) {
  const { id } = await params;
  const parsed = parseBoardRef(id);

  return (
    <PageShell>
      {parsed.ok ? (
        <>
          <h1 className="text-lg text-ink">The canvas isn&apos;t built yet</h1>
          <p className="mt-2 text-base text-ink-secondary">
            This board&apos;s address is reserved and the URL works — there is
            just nothing to draw on until the canvas ships.
          </p>

          <div className="mt-5 rounded-md border border-border bg-canvas px-3 py-2">
            <span className="text-xs text-ink-muted">Board id</span>
            <p className="text-md font-semibold text-ink tabular-nums">{parsed.id}</p>
          </div>

          <div className="mt-6 flex flex-wrap gap-3">
            <Button href="/#roadmap" variant="primary" size="sm">
              See what&apos;s left
            </Button>
            <Button href="/" variant="ghost" size="sm">
              Back to home
            </Button>
          </div>
        </>
      ) : (
        <>
          <h1 className="text-lg text-ink">That isn&apos;t a board id</h1>
          <p className="mt-2 text-base text-ink-secondary">{parsed.error}</p>
          <div className="mt-6">
            <Button href="/" variant="primary" size="sm">
              Back to home
            </Button>
          </div>
        </>
      )}
    </PageShell>
  );
}
