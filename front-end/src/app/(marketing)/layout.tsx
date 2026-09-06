// Chrome shared by every marketing surface (STYLE_GUIDE.md §13). Product
// routes — /board, /signin — sit outside this group and get none of it.

import { SiteHeader } from "@/components/site/SiteHeader";
import { SiteFooter } from "@/components/site/SiteFooter";

export default function MarketingLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex min-h-dvh flex-col">
      <a
        href="#main"
        className={
          "sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-60 " +
          "focus:rounded-md focus:bg-surface focus:px-4 focus:py-2 focus:text-base " +
          "focus:text-ink focus:shadow-elev-2 focus-visible:focus-ring"
        }
      >
        Skip to content
      </a>
      <SiteHeader />
      {/* tabIndex -1 so the skip link actually moves focus, not just the
          scroll position — <main> isn't focusable on its own. */}
      <main id="main" tabIndex={-1} className="flex-1 focus:outline-none">
        {children}
      </main>
      <SiteFooter />
    </div>
  );
}
