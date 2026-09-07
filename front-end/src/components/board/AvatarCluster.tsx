"use client";

// STYLE_GUIDE.md §10.11 — 24px discs, −8px overlap, +N chip beyond four.
// This is the accessible presence surface; the cursor layer is decorative.

import type { PresencePeer } from "@/lib/realtime/presence";
import type { Self } from "@/lib/realtime/board-session";

const MAX_SHOWN = 4;

function initial(name: string): string {
  return name.trim().charAt(0).toUpperCase() || "?";
}

function Disc({
  name,
  background,
  avatarUrl,
  className,
}: {
  name: string;
  background?: string;
  avatarUrl?: string | null;
  className: string;
}) {
  return (
    <span
      data-testid="presence-avatar"
      title={name}
      className={
        "-mr-2 grid size-6 place-items-center overflow-hidden rounded-pill text-2xs font-medium ring-2 ring-surface " +
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
  peers,
}: {
  self: Self | null;
  peers: PresencePeer[];
}) {
  const shown = peers.slice(0, MAX_SHOWN);
  const overflow = peers.length - shown.length;

  const names = [
    ...(self ? [`${self.name} (you)`] : []),
    ...peers.map((p) => p.name),
  ];

  return (
    <div
      className="flex shrink-0 items-center"
      role="group"
      aria-label={
        names.length ? `On this board: ${names.join(", ")}` : "On this board"
      }
    >
      {shown.map((peer) => (
        <Disc
          key={peer.clientId}
          name={peer.name}
          background={peer.color.label}
          avatarUrl={peer.avatarUrl}
          className="text-white"
        />
      ))}

      {/* Yours is the amethyst one — --you, never a palette hue (§1, §12). */}
      {self ? (
        <Disc name={self.name} className="bg-you text-accent-on" />
      ) : null}

      {overflow > 0 ? (
        <span className="ml-3 rounded-pill bg-wg-100 px-1.5 py-0.5 text-2xs font-medium text-ink-secondary">
          +{overflow}
        </span>
      ) : null}
    </div>
  );
}
