import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { SITE } from "@/lib/site";

export const alt = `${SITE.name} — ${SITE.tagline}`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Light tokens only — a social card has no theme to follow. Values are literal
// because next/og rasterises this outside the page's CSS (STYLE_GUIDE.md §11.1).
const CANVAS = "#FAF9F7";
const INK = "#241631";
const INK_SECONDARY = "#4A3D57";
const ACCENT = "#32174D";
const GRID = "#EDEAE4";

// Satori can't read the page's @font-face, and next/font ships woff2, which it
// doesn't parse — so the three weights the card uses are committed as TTFs.
const FONTS = join(process.cwd(), "src/app/fonts");

export default async function Image() {
  const [regular, semibold, bold] = await Promise.all([
    readFile(join(FONTS, "Poppins-Regular.ttf")),
    readFile(join(FONTS, "Poppins-SemiBold.ttf")),
    readFile(join(FONTS, "Poppins-Bold.ttf")),
  ]);

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 80,
          background: CANVAS,
          backgroundImage: `radial-gradient(${GRID} 2px, transparent 2px)`,
          backgroundSize: "48px 48px",
          fontFamily: "Poppins",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <svg width="48" height="48" viewBox="0 0 32 32">
            <g
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2.75"
              transform="translate(1 2.5)"
            >
              <path
                stroke={INK}
                d="M16 6c6-.5 10 4 9.5 10S20 26 14 25.5 4.5 19.5 5.5 13.5 10 5.5 14.5 6"
              />
              <path stroke={ACCENT} d="M14.5 6C12 5.5 9.7 3.6 8.2 1" />
            </g>
          </svg>
          <span
            style={{ fontSize: 44, fontWeight: 700, color: INK, letterSpacing: "-0.02em" }}
          >
            skrivle
          </span>
        </div>

        <div style={{ display: "flex", flexDirection: "column" }}>
          <span
            style={{
              fontSize: 76,
              fontWeight: 600,
              color: INK,
              letterSpacing: "-0.02em",
              lineHeight: 1.08,
              maxWidth: 900,
            }}
          >
            {SITE.tagline}
          </span>
          <span style={{ marginTop: 24, fontSize: 34, color: INK_SECONDARY }}>
            No account. No download. Just the link.
          </span>
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [
        { name: "Poppins", data: regular, weight: 400, style: "normal" },
        { name: "Poppins", data: semibold, weight: 600, style: "normal" },
        { name: "Poppins", data: bold, weight: 700, style: "normal" },
      ],
    },
  );
}
