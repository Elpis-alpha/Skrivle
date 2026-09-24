"use client";

// STYLE_GUIDE.md §10.24 — what everyone else has selected.
//
// Cursors show where people are; this shows what they're working on. Each
// element a peer has selected gets an outline in their cursor hue, and the peer
// is named once, on the first of them — colour is never the only identifier
// (§1). No handles: those are for the person who can use them.
//
// Inside the camera, like your own selection, and drawn from the same resolved
// box as the element (useShownElement), so an outline eases with a peer's drag
// exactly as the element does. It carries data-element-id, so when YOU drag an
// element someone else has selected, beginMove carries their outline with it.

import type * as Y from "yjs";
import { bboxOf } from "@/lib/board/geometry";
import type { PreviewStore } from "@/lib/board/preview";
import { useShownElement } from "@/lib/board/useShownElement";
import type { CursorColor } from "@/lib/presence-colors";
import type { PresencePeer } from "@/lib/realtime/presence";
import { useElementIds } from "@/lib/realtime/useElements";

/** Screen pixels the outline stands off the element, clear of your own selection box. */
const GAP_PX = 3;

export function PeerSelectionLayer({
  doc,
  peers,
  preview = null,
}: {
  doc: Y.Doc;
  peers: readonly PresencePeer[];
  preview?: PreviewStore | null;
}) {
  // A peer's selection can name an element that has since been deleted — by
  // them, by someone else, by an undo. Only what exists gets an outline, and
  // the name moves to whatever is left.
  const ids = useElementIds(doc);
  const present = new Set(ids);

  return (
    <>
      {peers.map((peer) => {
        const selected = peer.selection.filter((id) => present.has(id));
        return selected.map((id, index) => (
          <PeerOutline
            key={`${peer.clientId}:${id}`}
            doc={doc}
            id={id}
            color={peer.color}
            name={index === 0 ? peer.name : null}
            preview={preview}
          />
        ));
      })}
    </>
  );
}

function PeerOutline({
  doc,
  id,
  color,
  name,
  preview,
}: {
  doc: Y.Doc;
  id: string;
  color: CursorColor;
  /** Set on exactly one outline per peer. */
  name: string | null;
  preview: PreviewStore | null;
}) {
  const resolved = useShownElement(doc, id, preview);
  if (!resolved) return null;
  const box = bboxOf(resolved.shown);

  return (
    <div
      data-testid="peer-selection"
      data-element-id={id}
      aria-hidden
      className="pointer-events-none absolute"
      style={{ left: box.x, top: box.y, width: box.w, height: box.h }}
    >
      <div
        className="absolute rounded-[2px]"
        style={{
          // Board units, divided by the camera's scale, so the outline is the
          // same 1.5px and the same gap on screen at any zoom.
          inset: `calc(${-GAP_PX}px / var(--cam-scale, 1))`,
          border: `calc(1.5px / var(--cam-scale, 1)) solid ${color.base}`,
        }}
      />
      {name ? (
        <span
          className="absolute origin-bottom-left rounded-pill px-1.5 py-0.5 text-2xs font-medium whitespace-nowrap text-white"
          style={{
            backgroundColor: color.label,
            // Anchored by its bottom-left to just above the outline's corner,
            // then scaled about that same corner back to screen size — so it
            // grows upward, away from the element, at any zoom.
            left: `calc(${-GAP_PX}px / var(--cam-scale, 1))`,
            bottom: `calc(100% + ${GAP_PX + 2}px / var(--cam-scale, 1))`,
            transform: "scale(calc(1 / var(--cam-scale, 1)))",
          }}
        >
          {name}
        </span>
      ) : null}
    </div>
  );
}
