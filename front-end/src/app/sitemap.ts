import type { MetadataRoute } from "next";
import { SITE } from "@/lib/site";

// Boards are deliberately absent: they're private to whoever holds the link.
const ROUTES = ["", "/about", "/faq", "/contact", "/privacy", "/terms", "/signin"];

export default function sitemap(): MetadataRoute.Sitemap {
  // No lastModified: build time isn't edit time, and a date that moves on every
  // deploy teaches crawlers to ignore it.
  return ROUTES.map((route) => ({
    url: `${SITE.url}${route}`,
    changeFrequency: route === "" ? "weekly" : "monthly",
    priority: route === "" ? 1 : 0.6,
  }));
}
