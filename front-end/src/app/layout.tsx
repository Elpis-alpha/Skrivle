import type { Metadata } from "next";
import { Poppins } from "next/font/google";
import "./globals.css";
import { SITE } from "@/lib/site";
import { SessionProvider } from "@/lib/session/SessionProvider";

// STYLE_GUIDE.md §3 — one family. 400/500/600 for UI, 700 for the wordmark only.
const poppins = Poppins({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
  variable: "--font-poppins",
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE.url),
  title: {
    default: `${SITE.name} — ${SITE.tagline}`,
    template: `%s — ${SITE.name}`,
  },
  description: SITE.description,
  applicationName: SITE.name,
  openGraph: {
    type: "website",
    siteName: SITE.name,
    title: `${SITE.name} — ${SITE.tagline}`,
    description: SITE.description,
    url: SITE.url,
  },
  twitter: {
    card: "summary_large_image",
    title: `${SITE.name} — ${SITE.tagline}`,
    description: SITE.description,
  },
};

// STYLE_GUIDE.md §11.1 — theme is always explicit. This blocking script sets
// data-theme before first paint (localStorage choice, else system) so there is
// no flash of the wrong theme, and keeps following the OS while on "system".
const THEME_BOOT = `(function(){try{var k="skrivle-theme",c=localStorage.getItem(k),m=window.matchMedia("(prefers-color-scheme: dark)"),t=c==="light"||c==="dark"?c:m.matches?"dark":"light";document.documentElement.dataset.theme=t;m.addEventListener("change",function(e){var s=localStorage.getItem(k);if(s!=="light"&&s!=="dark")document.documentElement.dataset.theme=e.matches?"dark":"light";});}catch(e){document.documentElement.dataset.theme="light";}})();`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${poppins.variable} h-full`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT }} />
      </head>
      <body className="min-h-full antialiased">
        {/* One instance for the whole app, not one per route group: layouts
            unmount when navigation crosses a route-group boundary, so two
            separate providers would refetch /api/auth/me — and flash the
            header back to "loading" — on every trip between marketing and
            product surfaces. Marketing pages didn't need this before
            SiteHeader had to know whether you're signed in; now every page
            does, so the one credentialed GET per session is no longer a cost
            worth avoiding. */}
        <SessionProvider>{children}</SessionProvider>
      </body>
    </html>
  );
}
