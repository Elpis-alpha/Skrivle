"use client";

// STYLE_GUIDE.md §10.11 — 24px discs, −8px overlap, +N chip beyond four, and
// pressing the cluster lists everyone with their role ("Maya · editor").
// This is the accessible presence surface; the cursor layer is decorative.

import { useCallback, useEffect, useId, useRef, useState } from "react";
import type { Role } from "@/lib/api/types";
import type { PresencePeer } from "@/lib/realtime/presence";
import type { Self } from "@/lib/realtime/board-session";

const MAX_SHOWN = 4;

function initial(name: string): string {
  return name.trim().charAt(0).toUpperCase() || "?";
}

/** Anyone with the link can edit, so no role on record is an editor. */
const roleLabel = (role: Role | null): Role => role ?? "editor";

function Disc({
  name,
  background,
  avatarUrl,
  className,
  testId,
}: {
  name: string;
  background?: string;
  avatarUrl?: string | null;
  className: string;
  testId?: string;
}) {
  return (
    <span
      data-testid={testId}
      title={name}
      className={
        "grid size-6 shrink-0 place-items-center overflow-hidden rounded-pill text-2xs font-medium " +
        className
      }
      style={background ? { backgroundColor: background } : undefined}
    >
      {avatarUrl ? (
        // A plain <img>, not next/image: OAuth avatars come from
        // avatars.githubusercontent.com and lh3.googleusercontent.com, neither
        // of which is in next.config.ts remotePatterns — next/image throws at
        // runtime for an unconfigured host.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={avatarUrl}
          alt=""
          width={24}
          height={24}
          referrerPolicy="no-referrer"
          className="size-full object-cover"
          onError={(event) => {
            event.currentTarget.style.display = "none";
          }}
        />
      ) : (
        initial(name)
      )}
    </span>
  );
}

export function AvatarCluster({
  self,
  role,
  peers,
}: {
  self: Self | null;
  /** Yours, from the board's REST record, which a claim keeps current. */
  role: Role | null;
  peers: PresencePeer[];
}) {
  const shown = peers.slice(0, MAX_SHOWN);
  const overflow = peers.length - shown.length;
  const listId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  // Where the list sits, or null while it's closed. Fixed rather than
  // absolute: the top bar scrolls sideways on a narrow phone, and an absolute
  // popover inside it would be clipped to the bar's 56px.
  const [at, setAt] = useState<{ top: number; right: number } | null>(null);
  const close = useCallback(() => setAt(null), []);

  const toggle = () => {
    if (at) return close();
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    setAt({ top: rect.bottom + 8, right: Math.max(16, window.innerWidth - rect.right) });
  };

  // A small disclosure, not a modal: Esc and a press elsewhere close it, and
  // anything that would move the cluster out from under it does too.
  useEffect(() => {
    if (!at) return;

    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (listRef.current?.contains(target) || triggerRef.current?.contains(target)) return;
      close();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      close();
      triggerRef.current?.focus();
    };

    window.addEventListener("mousedown", onPointerDown);
    window.addEventListener("keydown", onKey);
    window.addEventListener("resize", close);
    window.addEventListener("scroll", close, true);
    return () => {
      window.removeEventListener("mousedown", onPointerDown);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", close);
      window.removeEventListener("scroll", close, true);
    };
  }, [at, close]);

  const names = [
    ...(self ? [`${self.name} (you)`] : []),
    ...peers.map((p) => p.name),
  ];

  return (
    <div className="shrink-0">
      <button
        ref={triggerRef}
        type="button"
        onClick={toggle}
        aria-expanded={at !== null}
        aria-controls={listId}
        aria-label={names.length ? `On this board: ${names.join(", ")}` : "On this board"}
        className={
          "flex items-center rounded-pill transition-[filter] duration-(--dur-fast) ease-standard " +
          "hover:brightness-95 focus-visible:focus-ring [&>*+*]:-ml-2"
        }
      >
        {shown.map((peer) => (
          <Disc
            key={peer.clientId}
            testId="presence-avatar"
            name={peer.name}
            background={peer.color.label}
            avatarUrl={peer.avatarUrl}
            className="text-white ring-2 ring-surface"
          />
        ))}

        {/* Yours is the amethyst one — --you, never a palette hue (§1, §12). */}
        {self ? (
          <Disc
            testId="presence-avatar"
            name={self.name}
            className="bg-you text-accent-on ring-2 ring-surface"
          />
        ) : null}

        {overflow > 0 ? (
          <span className="ml-1! rounded-pill bg-wg-100 px-1.5 py-0.5 text-2xs font-medium text-ink-secondary">
            +{overflow}
          </span>
        ) : null}
      </button>

      {at ? (
        <ul
          ref={listRef}
          id={listId}
          aria-label="On this board"
          style={{ top: at.top, right: at.right }}
          className={
            "fixed z-20 max-h-80 w-56 max-w-[calc(100vw-2rem)] overflow-y-auto rounded-md " +
            "border border-border bg-surface p-1 shadow-elev-2"
          }
        >
          {self ? (
            <Row name="You" role={roleLabel(role)}>
              <Disc name={self.name} className="bg-you text-accent-on" />
            </Row>
          ) : null}
          {peers.map((peer) => (
            <Row key={peer.clientId} name={peer.name} role={roleLabel(peer.role)}>
              <Disc
                name={peer.name}
                background={peer.color.label}
                avatarUrl={peer.avatarUrl}
                className="text-white"
              />
            </Row>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function Row({
  name,
  role,
  children,
}: {
  name: string;
  role: Role;
  children: React.ReactNode;
}) {
  return (
    <li className="flex items-center gap-2 rounded-sm px-2.5 py-1.5 text-sm text-ink">
      <span aria-hidden className="contents">
        {children}
      </span>
      <span className="min-w-0 truncate">
        {name}
        <span className="text-ink-muted"> · {role}</span>
      </span>
    </li>
  );
}
