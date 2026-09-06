import type { Metadata } from "next";
import { Poppins } from "next/font/google";
import "./globals.css";

// STYLE_GUIDE.md §3 — one family. 400/500/600 for UI, 700 for the wordmark only.
const poppins = Poppins({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
  variable: "--font-poppins",
});

export const metadata: Metadata = {
  title: "Skrivle",
  description:
    "A live collaborative whiteboard you can share in one link. No account, just a URL.",
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
      <body className="min-h-full antialiased">{children}</body>
    </html>
  );
}
