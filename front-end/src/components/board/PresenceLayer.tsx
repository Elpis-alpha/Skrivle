"use client";

// STYLE_GUIDE.md §10.10 — remote cursors.
//
// React never re-renders on cursor movement. One rAF loop writes transforms
// straight onto the DOM, because eight cursors at 20Hz through React state is
// a re-render storm the canvas can't afford.
//
// This layer lives INSIDE the camera, so cursors are carried by the same
// transform as the board content. Converting board coordinates to screen ones
// here instead would put the camera (a React commit) and the cursors (this rAF)
// on different frames, and peers' cursors would visibly detach from the work
// they are pointing at during any pan or zoom.

import { useEffect, useRef } from "react";
import { CursorArrow } from "@/components/board/CursorArrow";
import type { PresencePeer } from "@/lib/realtime/presence";

/** §7: interpolate over ~70ms LINEARLY — an easing curve makes cursors stutter. */
const INTERPOLATE_MS = 70;

/** §7: the name tag fades out after 3s idle and returns on movement. */
const IDLE_MS = 3000;

type Tracked = {
  root: HTMLDivElement;
  label: HTMLSpanElement | null;
  current: { x: number; y: number } | null;
  /** When this peer last actually moved, by OUR clock. See movedAt below. */
  movedAt: number;
  lastSeen: { x: number; y: number } | null;
};

export function PresenceLayer({ peers }: { peers: PresencePeer[] }) {
  const nodes = useRef(new Map<number, Tracked>());
  const peersRef = useRef(peers);
  useEffect(() => {
    peersRef.current = peers;
  }, [peers]);

  useEffect(() => {
    let frame = 0;
    let last = performance.now();

    const tick = (now: number) => {
      const dt = now - last;
      last = now;
      // Linear approach to the target: a fixed fraction of the remaining gap
      // per frame, sized so a cursor closes it in about INTERPOLATE_MS.
      const t = Math.min(1, dt / INTERPOLATE_MS);

      for (const peer of peersRef.current) {
        const tracked = nodes.current.get(peer.clientId);
        if (!tracked || !peer.cursor) continue;

        const target = peer.cursor;
        // First sighting: land on the spot rather than flying in from 0,0.
        tracked.current ??= { x: target.x, y: target.y };
        tracked.current.x += (target.x - tracked.current.x) * t;
        tracked.current.y += (target.y - tracked.current.y) * t;

        tracked.root.style.transform = `translate3d(${tracked.current.x}px, ${tracked.current.y}px, 0)`;

        // Idle is measured against OUR clock, not the timestamp the peer sent:
        // cursor.t comes from their Date.now(), and a few seconds of clock skew
        // is enough to leave a name tag permanently visible or never shown.
        if (
          tracked.lastSeen === null ||
          tracked.lastSeen.x !== target.x ||
          tracked.lastSeen.y !== target.y
        ) {
          tracked.lastSeen = { x: target.x, y: target.y };
          tracked.movedAt = now;
        }

        if (tracked.label) {
          tracked.label.style.opacity = now - tracked.movedAt > IDLE_MS ? "0" : "1";
        }
      }

      frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, []);

  return (
    // Decorative: the avatar cluster is the accessible presence surface.
    //
    // No overflow-hidden: inside the camera, inset-0 is the host's size in BOARD
    // units, so clipping to it would drop every peer outside that box — half of
    // them at 200% zoom. The canvas host already clips.
    <div className="pointer-events-none absolute inset-0" aria-hidden>
      {peers.map((peer) => (
        <div
          key={peer.clientId}
          data-testid="remote-cursor"
          ref={(root) => {
            if (!root) {
              nodes.current.delete(peer.clientId);
              return;
            }
            const existing = nodes.current.get(peer.clientId);
            nodes.current.set(peer.clientId, {
              root,
              label: root.querySelector("span"),
              current: existing?.current ?? null,
              movedAt: existing?.movedAt ?? performance.now(),
              lastSeen: existing?.lastSeen ?? null,
            });
          }}
          className="absolute left-0 top-0 will-change-transform"
          style={{ visibility: peer.cursor ? "visible" : "hidden" }}
        >
          {/* The camera scales the board; a cursor is chrome, so it must not
              scale with it. --cam-scale is written by CameraLayer in the same
              frame as the transform, so the two can never disagree. */}
          <div className="origin-top-left" style={{ transform: "scale(calc(1 / var(--cam-scale, 1)))" }}>
            <CursorArrow color={peer.color} name={peer.name} />
          </div>
        </div>
      ))}
    </div>
  );
}
