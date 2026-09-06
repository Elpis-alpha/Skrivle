import Link from "next/link";
import type { ReactNode } from "react";
import { Wordmark } from "@/components/ui/Wordmark";

/**
 * A centred card on the paper, for the routes that carry no marketing chrome:
 * /signin, /board/[id], and the 404. §10.16 dialog treatment, as a page.
 */
export function PageShell({ children }: { children: ReactNode }) {
  return (
    <div className="relative flex min-h-dvh flex-col items-center justify-center overflow-hidden px-6 py-16">
      <div className="dot-grid grid-fade absolute inset-0 -z-10" aria-hidden="true" />

      <Link
        href="/"
        className="mb-8 rounded-sm focus-visible:focus-ring"
        aria-label="Skrivle — home"
      >
        <Wordmark className="text-lg" />
      </Link>

      <main className="w-full max-w-md rounded-lg border border-border bg-surface-raised p-6 shadow-elev-3">
        {children}
      </main>
    </div>
  );
}
