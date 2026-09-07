// Resolving a sign-in to a user account.
//
// One User holds many Identity rows — one per (provider, account) — so signing
// in with Google today and GitHub tomorrow lands on the same person and the
// same boards. The old schema put a single `provider` enum on User, which made
// that unrepresentable.
import type { AuthProvider, User } from "@prisma/client";
import { prisma } from "../db/prisma.js";
import { normalizeEmail } from "./otp.js";

export type ProviderProfile = {
  provider: AuthProvider;
  /** The provider's stable subject id. For `email`, the address itself. */
  providerAccountId: string;
  email: string;
  /**
   * Whether the *provider* asserts this address is verified. Load-bearing —
   * see resolveUser. Never set this true from user-supplied input.
   */
  emailVerified: boolean;
  name: string;
  avatarUrl?: string | undefined;
};

/**
 * Find or create the user behind a sign-in.
 *
 * The branch that matters is the third one. Linking an OAuth account to an
 * existing user by email address is convenient, but if the provider has not
 * verified that address, anyone who can set their profile email to
 * victim@example.com at a sloppy provider could walk into that account. So
 * unverified addresses get their own user instead, and linking becomes an
 * explicit action the real owner can take later.
 */
export async function resolveUser(profile: ProviderProfile): Promise<User> {
  const email = normalizeEmail(profile.email);

  // 1. Seen this exact provider account before.
  const existing = await prisma.identity.findUnique({
    where: {
      provider_providerAccountId: {
        provider: profile.provider,
        providerAccountId: profile.providerAccountId,
      },
    },
    include: { user: true },
  });
  if (existing) return existing.user;

  const byEmail = await prisma.user.findUnique({ where: { email } });

  // 2. New provider account, verified address, and we know that address.
  if (byEmail && profile.emailVerified) {
    await prisma.identity.create({
      data: {
        userId: byEmail.id,
        provider: profile.provider,
        providerAccountId: profile.providerAccountId,
      },
    });
    // Backfill an avatar only if they have none — never overwrite a chosen one.
    if (!byEmail.avatarUrl && profile.avatarUrl) {
      return prisma.user.update({
        where: { id: byEmail.id },
        data: { avatarUrl: profile.avatarUrl },
      });
    }
    return byEmail;
  }

  // 3. New provider account, unverified address that collides with a known
  //    user. Refuse to link; the addresses must stay unique, so this account
  //    cannot be created either.
  if (byEmail && !profile.emailVerified) {
    throw new UnverifiedEmailCollision(email);
  }

  // 4. Nobody here yet.
  return prisma.user.create({
    data: {
      email,
      name: profile.name.trim() || email.split("@")[0],
      avatarUrl: profile.avatarUrl ?? null,
      identities: {
        create: {
          provider: profile.provider,
          providerAccountId: profile.providerAccountId,
        },
      },
    },
  });
}

/**
 * Raised when a provider offers an unverified address that already belongs to
 * someone. Signing in would either hand over their account or silently create
 * a duplicate, so the flow stops and asks the user to verify.
 */
export class UnverifiedEmailCollision extends Error {
  constructor(public readonly email: string) {
    super(`${email} is already in use by a verified account.`);
    this.name = "UnverifiedEmailCollision";
  }
}

/**
 * The shape sent to the browser. Never leaks internal columns.
 *
 * Takes a `Pick`, not the full `User`, so it also accepts `req.user` — which
 * is deliberately fetched with the same narrow `select` (see
 * `auth/middleware.ts`'s `SessionUser`) rather than the whole row.
 */
export function publicUser(user: Pick<User, "id" | "email" | "name" | "avatarUrl">) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    avatarUrl: user.avatarUrl,
  };
}
