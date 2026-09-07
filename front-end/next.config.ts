import type { NextConfig } from "next";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

// Gives `next dev` access to the Cloudflare bindings declared in wrangler.jsonc.
initOpenNextCloudflareForDev();

const nextConfig: NextConfig = {
  images: {
    // Two different Cloudinary clouds, on purpose.
    remotePatterns: [
      {
        // The dev photos on /about and the landing page live on the author's
        // personal account; transforms (f_auto,q_auto,w_*) are applied in the URL.
        protocol: "https",
        hostname: "res.cloudinary.com",
        pathname: "/elpis-cloud/**",
      },
      {
        // Skrivle's own account: board thumbnails and uploaded avatars, written
        // by the back-end's signed direct uploads (back-end/src/media/cloudinary.ts).
        protocol: "https",
        hostname: "res.cloudinary.com",
        pathname: "/lbsvdx2r/**",
      },
    ],
  },
};

export default nextConfig;
