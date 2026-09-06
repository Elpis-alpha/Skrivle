// Single source for everything the marketing surface repeats: navigation,
// footer, FAQ, the author's details. Pages import from here rather than
// hard-coding a link twice and letting the two drift.

export const SITE = {
  name: "Skrivle",
  /** The product line. Used in metadata and on the coming-soon page. */
  tagline: "A whiteboard you can share in one link.",
  description:
    "A live collaborative whiteboard you can share in one link. No account, no download — open the link and start drawing.",
  url: "https://skrivle.elpis.cc",
  repo: "https://github.com/Elpis-alpha/Skrivle",
} as const;

export const NAV_LINKS = [
  { href: "/#features", label: "Features" },
  { href: "/#how-it-works", label: "How it works" },
  { href: "/#open-source", label: "Open source" },
  { href: "/#faq", label: "FAQ" },
] as const;

export const FOOTER_COLUMNS = [
  {
    heading: "Product",
    links: [
      { href: "/#features", label: "Features" },
      { href: "/#roadmap", label: "Roadmap" },
      { href: "/faq", label: "FAQ" },
      { href: "/signin", label: "Sign in" },
    ],
  },
  {
    heading: "Project",
    links: [
      { href: `${SITE.repo}/issues`, label: "Open an issue", external: true },
      { href: SITE.repo, label: "Source code", external: true },
    ],
  },
  {
    heading: "Legal",
    links: [
      { href: "/privacy", label: "Privacy" },
      { href: "/terms", label: "Terms" },
    ],
  },
] as const;

export const AUTHOR = {
  name: "Festus Gbolade",
  handle: "Elpis",
  role: "MERN stack developer",
  years: "~5 years building for startups and enterprise platforms",
  site: "https://www.elpis.cc",
  about: "https://www.elpis.cc/about",
  socials: [
    { label: "GitHub", href: "https://github.com/Elpis-alpha" },
    { label: "LinkedIn", href: "https://www.linkedin.com/in/elpis-alpha" },
    { label: "X", href: "https://twitter.com/elpis_alpha" },
  ],
  interests: ["Open source", "System design", "Web & structural design"],
} as const;

/**
 * Cloudinary, scaled to 640px — twice the largest size any layout renders them
 * at, so they stay sharp on a 2× display without shipping the original.
 */
const PHOTO_BASE = "https://res.cloudinary.com/elpis-cloud/image/upload";

export const AUTHOR_PHOTOS = {
  corporate: `${PHOTO_BASE}/f_auto,q_auto,c_crop,g_north,h_0.65,w_640/v1773224482/private/corporate_emkakn.jpg`,
  native: `${PHOTO_BASE}/f_auto,q_auto,c_scale,w_640/v1773224482/private/native_p5rtat.jpg`,
  stylish: `${PHOTO_BASE}/f_auto,q_auto,c_scale,w_640/v1773224483/private/stylish_vudwvg.jpg`,
} as const;

export type FaqEntry = { q: string; a: string };

/** The six on the landing page. /faq carries these plus the longer ones. */
export const FAQS: readonly FaqEntry[] = [
  {
    q: "Do I need an account?",
    a: "No. Create a board, share the link, and anyone who opens it can draw straight away. Signing in is only for keeping boards past their expiry.",
  },
  {
    q: "How long does a board last?",
    a: "A board made without an account lasts 24 hours, and whoever created it can add another 48 — still without signing in. Sign in and the board stops expiring altogether.",
  },
  {
    q: "Who can edit a board I share?",
    a: "Anyone with the link. There are two roles in the first version, owner and editor, and no view-only mode yet — treat a board link like a key.",
  },
  {
    q: "What does it cost?",
    a: "Nothing. Skrivle is a portfolio project, not a business, so there is no paid tier and no trial to run out.",
  },
  {
    q: "What happens to what I draw?",
    a: "It is stored as a single binary snapshot of the board, not picked apart into a database. Expired boards are deleted outright, snapshot included.",
  },
  {
    q: "Is the code public?",
    a: "Yes — MIT licensed, on GitHub, including the design system this page is built from.",
  },
];
