// Mirrors back-end/openapi.yaml.
//
// Kept in sync by hand: the monorepo has no shared workspace tooling and
// cross-folder imports are off the table (CLAUDE.md), the same reason
// presence-colors.ts and board-id.ts mirror their server counterparts. This
// file holds types only — no logic — so drift against the spec is a one-file
// diff. The spec is served at ${API_URL}/api/openapi.json and its operation
// list is test-locked to the route table in back-end/src/http/openapi.test.ts.
//
// Dates arrive as ISO strings: the server hands res.json() a Date.

export type Role = "owner" | "editor";

export type User = {
  id: string;
  email: string;
  name: string;
  avatarUrl: string | null;
};

/** Which sign-in methods this deployment has credentials for. */
export type AuthMethods = {
  email: boolean;
  github: boolean;
  google: boolean;
};

export type MeResponse = {
  /** null for a guest. GET /api/auth/me never 401s. */
  user: User | null;
  methods: AuthMethods;
};

export type Board = {
  id: string;
  title: string;
  isEphemeral: boolean;
  /** ISO string, or null for a board that never expires. */
  expiresAt: string | null;
  updatedAt: string;
  hasOwner: boolean;
  thumbnailUrl: string | null;
};

/** GET /api/boards/:id — `role` is null for someone who just holds the link. */
export type BoardWithRole = Board & { role: Role | null };

/**
 * POST /api/boards. `creatorToken` is non-null only for signed-out creation and
 * is returned exactly once — the server keeps only its HMAC. It is the sole
 * handle for extending or claiming a guest board, so persist it immediately.
 */
export type CreatedBoard = Board & { creatorToken: string | null };

/** GET /api/boards — the My Boards row. */
export type BoardSummary = {
  id: string;
  title: string;
  updatedAt: string;
  role: Role;
  thumbnailUrl: string | null;
};

export type OAuthProvider = "github" | "google";
