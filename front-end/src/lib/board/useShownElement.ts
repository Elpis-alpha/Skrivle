"use client";

// What an element should be drawn as right now, which is not always what the
// document says.
//
// `el` is the document's snapshot. `shown` is what to paint, and differs in two
// ways:
//
//  - A resize or draw-out in progress shows a box the document hasn't been sent
//    yet (preview.ts), exactly and at once.
//  - A peer's change eases in over INTERPOLATE_MS instead of jumping, because it
//    arrived as one of a series of PUBLISH_MS steps. Our own changes never ease:
//    they were already painted at frame rate while they happened.
//
// Anything that draws an element's geometry — the element and its selection
// outline alike — reads `shown`, so the two can never disagree about where the
// element is.

import { useEffect, useState } from "react";
import type * as Y from "yjs";
import type { ElementSnapshot } from "@/lib/realtime/doc-schema";
import { changedByPeer, useElement } from "@/lib/realtime/useElements";
import { fitElement } from "./geometry";
import { approachAll } from "./motion";
import { usePreviewBox, type PreviewStore } from "./preview";

type Box = Pick<ElementSnapshot, "x" | "y" | "w" | "h">;
type Key = keyof Box;

const MOVE_AND_SIZE: readonly Key[] = ["x", "y", "w", "h"];
/**
 * A stroke's size changes as its samples arrive, and PathView draws each sample
 * the moment it lands — easing the box would squash the ink already there. So a
 * stroke eases where it is, never how big it is.
 */
const MOVE_ONLY: readonly Key[] = ["x", "y"];

const ZERO: Box = { x: 0, y: 0, w: 0, h: 0 };

const same = (a: Box, b: Box) => a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h;
const boxOf = ({ x, y, w, h }: Box): Box => ({ x, y, w, h });

export function useShownElement(
  doc: Y.Doc | null,
  id: string,
  preview: PreviewStore | null = null,
): { el: ElementSnapshot; shown: ElementSnapshot } | null {
  const el = useElement(doc, id);
  const previewBox = usePreviewBox(preview, id);
  const target = el ? (previewBox ? fitElement(el, previewBox) : el) : null;

  const keys = el?.kind === "path" ? MOVE_ONLY : MOVE_AND_SIZE;
  const eases = el !== null && previewBox === null && changedByPeer(el);
  const current = useEased(target ? boxOf(target) : ZERO, eases, keys);

  if (!el || !target) return null;
  return { el, shown: same(current, target) ? target : { ...target, ...current } };
}

/**
 * `target`, reached gradually when `eases` is set on the render it changes, or
 * at once when it isn't.
 */
function useEased(target: Box, eases: boolean, keys: readonly Key[]): Box {
  const [state, setState] = useState({ target, current: target });

  // Adjusting state during render rather than in an effect, so the frame the
  // new target lands on still paints the old position — an effect would paint
  // the target first and then yank it back to start easing.
  if (!same(state.target, target)) {
    // Keys that don't ease (a stroke's size) take the target at once.
    const from = eases ? { ...target, ...pick(state.current, keys) } : target;
    setState({ target, current: from });
  }

  const moving = !same(state.current, state.target);

  useEffect(() => {
    if (!moving) return;
    let last = performance.now();
    let frame = requestAnimationFrame(function tick(now) {
      const dt = now - last;
      last = now;
      setState((s) => ({ ...s, current: approachAll(s.current, s.target, keys, dt) }));
      // Unconditionally: arriving flips `moving` false, and this effect's
      // cleanup is what stops the loop. Deciding here instead — from inside the
      // updater — would depend on whether React happens to run it eagerly, and
      // a peer's next update landing on the arrival frame would find the loop
      // already gone while `moving` never flipped to restart it.
      frame = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(frame);
  }, [moving, keys]);

  return state.current;
}

function pick(box: Box, keys: readonly Key[]): Partial<Box> {
  const out: Partial<Box> = {};
  for (const key of keys) out[key] = box[key];
  return out;
}
