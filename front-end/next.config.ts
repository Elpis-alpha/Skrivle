import type { NextConfig } from "next";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

// Gives `next dev` access to the Cloudflare bindings declared in wrangler.jsonc.
initOpenNextCloudflareForDev();

const nextConfig: NextConfig = {
  images: {
    // The dev photos on /about and the landing page live on the author's
    // Cloudinary account; transforms (f_auto,q_auto,w_*) are applied in the URL.
    remotePatterns: [
      {
        protocol: "https",
        hostname: "res.cloudinary.com",
        pathname: "/elpis-cloud/**",
      },
    ],
  },
};

export default nextConfig;
