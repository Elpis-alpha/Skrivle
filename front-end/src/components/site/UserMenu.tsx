"use client";

// STYLE_GUIDE.md §10.18 — the header's account control. Signed out, this is
// exactly the "Sign in" button it replaces (same variant/size per context);
// signed in, it's an avatar disc that opens My Boards / Sign out. No portal
// needed here — unlike CreateBoardDialog this is `position: absolute`, not
// `fixed`, so a backdrop-blur ancestor's containing block doesn't apply.

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Button, type ButtonSize } from "@/components/ui/Button";
import { useSession } from "@/lib/session/SessionProvider";

function initial(name: string): string {
  return name.trim().charAt(0).toUpperCase() || "?";
}

export function UserMenu({
  /** "sm" for the desktop bar, "lg" for the mobile full-screen panel. */
  size = "sm",
  /** Mirrors NewBoardButton's prop: closes the mobile panel on navigation. */
  onNavigate,
}: {
  size?: Extract<ButtonSize, "sm" | "lg">;
  onNavigate?: () => void;
}) {
  const { user, status, signOut } = useSession();
  const router = useRouter();
  const menuId = useId();
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const close = useCallback(() => setOpen(false), []);

  // Esc and a click outside both close it; neither needs a focus trap the way
  // a modal does; a menu is a small disclosure, not a page-blocking dialog.
  useEffect(() => {
    if (!open) return;

    function onPointerDown(event: MouseEvent) {
      const target = event.target as Node;
      if (menuRef.current?.contains(target) || triggerRef.current?.contains(target)) return;
      close();
    }
    function onKey(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      close();
      triggerRef.current?.focus();
    }

    window.addEventListener("mousedown", onPointerDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onPointerDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open, close]);

  // Same footprint as the button it replaces either way, so nothing shifts
  // once /api/auth/me answers (§10.20).
  if (status === "loading") {
    return (
      <div
        aria-hidden
        className={
          "animate-pulse rounded-pill bg-wg-100 " + (size === "lg" ? "size-12" : "size-8")
        }
      />
    );
  }

  if (!user) {
    return (
      <Button href="/signin" variant={size === "lg" ? "secondary" : "ghost"} size={size}>
        Sign in
      </Button>
    );
  }

  async function handleSignOut() {
    close();
    onNavigate?.();
    await signOut();
    router.push("/");
  }

  const dim = size === "lg" ? "size-12 text-base" : "size-8 text-sm";

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        aria-label={`Account menu for ${user.name}`}
        className={
          "grid shrink-0 place-items-center overflow-hidden rounded-pill bg-you font-medium " +
          "text-accent-on transition-colors duration-(--dur-fast) ease-standard hover:brightness-95 " +
          "focus-visible:focus-ring " +
          dim
        }
      >
        {user.avatarUrl ? (
          // A plain <img>, not next/image — OAuth avatars come from hosts
          // that aren't in next.config.ts remotePatterns (STYLE_GUIDE §10.11).
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={user.avatarUrl}
            alt=""
            referrerPolicy="no-referrer"
            className="size-full object-cover"
            onError={(event) => {
              event.currentTarget.style.display = "none";
            }}
          />
        ) : (
          initial(user.name)
        )}
      </button>

      {open ? (
        <div
          ref={menuRef}
          id={menuId}
          role="menu"
          aria-label="Account"
          className="absolute right-0 top-full z-20 mt-2 w-52 rounded-md border border-border bg-surface p-1 shadow-elev-2"
        >
          <p className="truncate px-2.5 py-2 text-sm text-ink-secondary" title={user.email}>
            Signed in as <span className="text-ink">{user.name}</span>
          </p>
          <Link
            href="/boards"
            role="menuitem"
            onClick={() => {
              close();
              onNavigate?.();
            }}
            className="block rounded-sm px-2.5 py-2 text-base text-ink hover:bg-wg-50 focus-visible:focus-ring"
          >
            My Boards
          </Link>
          <button
            type="button"
            role="menuitem"
            onClick={() => void handleSignOut()}
            className="block w-full rounded-sm px-2.5 py-2 text-left text-base text-danger hover:bg-danger-subtle focus-visible:focus-ring"
          >
            Sign out
          </button>
        </div>
      ) : null}
    </div>
  );
}
