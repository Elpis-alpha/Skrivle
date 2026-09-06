import type { MetadataRoute } from "next";
import { SITE } from "@/lib/site";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      // A board link is the only access control there is — keep them out of
      // search results.
      disallow: "/board/",
    },
    sitemap: `${SITE.url}/sitemap.xml`,
  };
}
