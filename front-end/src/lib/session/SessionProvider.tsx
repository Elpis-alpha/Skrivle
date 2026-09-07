"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { getMe, logout as postLogout } from "@/lib/api/auth";
import type { AuthMethods, User } from "@/lib/api/types";
import { pruneCreatorTokens } from "@/lib/board/creator-tokens";

type Status = "loading" | "ready" | "error";

export type SessionValue = {
  user: User | null;
  /** Which sign-in methods this deployment actually has credentials for. */
  methods: AuthMethods;
  status: Status;
  /** Re-read GET /api/auth/me. */
  refresh: () => Promise<void>;
  /** Apply a User an auth call already returned, skipping a round trip. */
  setUser: (user: User | null) => void;
  signOut: () => Promise<void>;
};

// Never optimistic. Rendering a "Continue with Google" button on a deployment
// with no Google credentials is a promise the server can't keep, so every
// method stays false until /api/auth/me says otherwise.
const NO_METHODS: AuthMethods = { email: false, github: false, google: false };

const SessionContext = createContext<SessionValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [methods, setMethods] = useState<AuthMethods>(NO_METHODS);
  const [status, setStatus] = useState<Status>("loading");

  const [nonce, setNonce] = useState(0);
  const refresh = useCallback(async () => {
    setNonce((n) => n + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;

    getMe().then(
      (me) => {
        if (cancelled) return;
        setUser(me.user);
        setMethods(me.methods);
        setStatus("ready");
      },
      () => {
        // /api/auth/me never 401s, so the only failure here is "the server is
        // unreachable". Stay signed out and let each screen decide what to say.
        if (!cancelled) setStatus("error");
      },
    );

    return () => {
      cancelled = true;
    };
  }, [nonce]);

  useEffect(() => {
    // This provider mounts once for the whole app, which makes it the right
    // place to expire stale guest board tokens.
    pruneCreatorTokens();
  }, []);

  const signOut = useCallback(async () => {
    try {
      await postLogout();
    } finally {
      // The cookie is cleared server-side even on a network hiccup mid-flight;
      // signing out locally regardless is the honest behaviour.
      setUser(null);
    }
  }, []);

  const value = useMemo<SessionValue>(
    () => ({ user, methods, status, refresh, setUser, signOut }),
    [user, methods, status, refresh, signOut],
  );

  return (
    <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
  );
}

export function useSession(): SessionValue {
  const value = useContext(SessionContext);
  if (!value) {
    throw new Error("useSession must be used inside the root SessionProvider.");
  }
  return value;
}
