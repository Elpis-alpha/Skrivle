"use client";

// What an element looks like mid-gesture, before the document has caught up.
//
// Resize and draw-out only write the doc every PUBLISH_MS, which is right for
// the wire and wrong for the person dragging: 20fps under their own pointer. So
// the gesture writes here every frame as well, and the element renders this box
// in place of its own until the gesture ends and hands back to the doc.
//
// The box holds the fields exactly as resizeElement would write them — for a
// line, w/h are still a delta from its start — so it can be laid straight over
// the element's snapshot.
//
// Subscriptions are per id, so a resize re-renders the one element being
// resized rather than every element on the board.

import { useCallback, useSyncExternalStore } from "react";
import type { Rect } from "./geometry";

export type PreviewStore = {
  get: (id: string) => Rect | null;
  set: (id: string, rect: Rect) => void;
  clear: (id: string) => void;
  subscribe: (id: string, listener: () => void) => () => void;
};

export function createPreviewStore(): PreviewStore {
  const boxes = new Map<string, Rect>();
  const listeners = new Map<string, Set<() => void>>();

  const notify = (id: string) => {
    for (const listener of listeners.get(id) ?? []) listener();
  };

  return {
    get: (id) => boxes.get(id) ?? null,
    set(id, rect) {
      boxes.set(id, rect);
      notify(id);
    },
    clear(id) {
      if (!boxes.delete(id)) return;
      notify(id);
    },
    subscribe(id, listener) {
      let set = listeners.get(id);
      if (!set) listeners.set(id, (set = new Set()));
      set.add(listener);
      return () => {
        set.delete(listener);
        if (set.size === 0) listeners.delete(id);
      };
    },
  };
}

const NO_OP = () => () => {};

/** The box a gesture is showing for this element, or null when none is. */
export function usePreviewBox(store: PreviewStore | null, id: string): Rect | null {
  const subscribe = useCallback(
    (onChange: () => void) => (store ? store.subscribe(id, onChange) : NO_OP()),
    [store, id],
  );
  const getSnapshot = useCallback(() => store?.get(id) ?? null, [store, id]);
  return useSyncExternalStore(subscribe, getSnapshot, () => null);
}
