// Where the API lives.
//
// This is the only `process.env` read in src/. NEXT_PUBLIC_* is inlined by
// `next build`, so the value below is frozen at build time — setting it as a
// wrangler `var` or in .dev.vars does nothing, because those exist only at
// worker runtime, long after the bundle was written. To point a build at a
// different API: NEXT_PUBLIC_API_URL=... npm run deploy

const FALLBACK =
  process.env.NODE_ENV === "development"
    ? "http://localhost:4000"
    : "https://api.skrivle.elpis.cc";

/** API origin, without a trailing slash. */
export const API_URL = (process.env.NEXT_PUBLIC_API_URL || FALLBACK).replace(
  /\/+$/,
  "",
);
