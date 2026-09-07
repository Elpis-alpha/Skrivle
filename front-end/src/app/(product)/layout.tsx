import type { ReactNode } from "react";
import { SessionProvider } from "@/lib/session/SessionProvider";

/**
 * The product surfaces — /signin, /board/:id, /boards — all need to know who
 * you are. The marketing group deliberately sits outside this: putting the
 * provider in the root layout would fire a credentialed cross-origin
 * GET /api/auth/me on every landing-page view, coupling pages that depend on no
 * back-end at all to one that might be down.
 *
 * Route groups don't affect URLs, so every path below is unchanged.
 */
export default function ProductLayout({ children }: { children: ReactNode }) {
  return <SessionProvider>{children}</SessionProvider>;
}
