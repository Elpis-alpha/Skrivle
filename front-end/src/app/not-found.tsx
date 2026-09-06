// §10.21 voice: say what happened and what to do next, don't apologise.

import { PageShell } from "@/components/site/PageShell";
import { Button } from "@/components/ui/Button";

export default function NotFound() {
  return (
    <PageShell>
      <h1 className="text-lg text-ink">There&apos;s nothing at this address</h1>
      <p className="mt-2 text-base text-ink-secondary">
        The page may have moved, or the link may have picked up a stray
        character on the way here.
      </p>
      <div className="mt-6 flex flex-wrap gap-3">
        <Button href="/" variant="primary" size="sm">
          Back to home
        </Button>
        <Button href="/faq" variant="ghost" size="sm">
          Read the FAQ
        </Button>
      </div>
    </PageShell>
  );
}
