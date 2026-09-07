"use client";

// Binding the Yjs document to React.
//
// Three separate subscriptions, split by what actually emits events, because a
// Y.Map's own observer does NOT fire for changes inside a nested Y.Text or
// Y.Array — only observeDeep does. One subscription per element would therefore
// never re-render on typing or on pen samples, and observeDeep would rebuild
// every scalar 60 times a second while a stroke is being drawn. So: scalars
// here, text in useYText, and pen samples never through React at all (PathView
// writes the `d` attribute straight onto the DOM).
//
// Snapshot caches are keyed by the Yjs type instance rather than by element id.
// Ids repeat across doc instances — StrictMode mounts twice, and useBoardDoc
// reopens the session when the display name changes, which is what signing in
// mid-board does — so an id-keyed cache would quietly serve a snapshot built
// from a destroyed document.

import { useCallback, useSyncExternalStore } from "react";
import * as Y from "yjs";
import { orderedIds, readElement } from "@/lib/board/elements";
import { elements, order, type ElementSnapshot } from "./doc-schema";

const idsCache = new WeakMap<Y.Doc, readonly string[]>();
const elementCache = new WeakMap<Y.Map<unknown>, ElementSnapshot>();
const textCache = new WeakMap<Y.Text, string>();

// Module-level constants: useSyncExternalStore compares by identity, so a fresh
// literal from getSnapshot would loop React forever.
const EMPTY_IDS: readonly string[] = Object.freeze([]);

const alive = (doc: Y.Doc | null): doc is Y.Doc => doc !== null && !doc.isDestroyed;

const NO_OP = () => () => {};

/** The ids to paint, in order. Re-renders when elements are added, removed or reordered. */
export function useElementIds(doc: Y.Doc | null): readonly string[] {
  const subscribe = useCallback(
    (onChange: () => void) => {
      if (!alive(doc)) return NO_OP();
      const els = elements(doc);
      const list = order(doc);
      const fire = () => {
        idsCache.delete(doc);
        onChange();
      };
      els.observe(fire);
      list.observe(fire);
      return () => {
        els.unobserve(fire);
        list.unobserve(fire);
      };
    },
    [doc],
  );

  const getSnapshot = useCallback(() => {
    if (!alive(doc)) return EMPTY_IDS;
    let cached = idsCache.get(doc);
    if (!cached) {
      cached = Object.freeze(orderedIds(doc));
      idsCache.set(doc, cached);
    }
    return cached;
  }, [doc]);

  return useSyncExternalStore(subscribe, getSnapshot, () => EMPTY_IDS);
}

/**
 * One element's scalar fields, or null once it is gone.
 *
 * Subscribing to the element's own map is not enough to notice its own
 * deletion: Yjs removes a deleted type from the changed set and skips its
 * observers entirely, so a component watching only itself would render a ghost
 * forever. The parent `elements` map is the only thing that reports it.
 */
export function useElement(doc: Y.Doc | null, id: string): ElementSnapshot | null {
  const subscribe = useCallback(
    (onChange: () => void) => {
      if (!alive(doc)) return NO_OP();
      const els = elements(doc);
      let bound = els.get(id) ?? null;

      const fire = () => {
        if (bound) elementCache.delete(bound);
        onChange();
      };

      // An element can be replaced rather than merely changed — undoing a
      // delete puts a different Y.Map at the same id — so the subscription has
      // to follow it.
      const onParentChange = () => {
        const next = els.get(id) ?? null;
        if (next !== bound) {
          bound?.unobserve(fire);
          bound = next;
          bound?.observe(fire);
        }
        fire();
      };

      bound?.observe(fire);
      els.observe(onParentChange);
      return () => {
        bound?.unobserve(fire);
        els.unobserve(onParentChange);
      };
    },
    [doc, id],
  );

  const getSnapshot = useCallback(() => {
    if (!alive(doc)) return null;
    const map = elements(doc).get(id);
    if (!map) return null;
    let cached = elementCache.get(map);
    if (!cached) {
      cached = readElement(id, map);
      elementCache.set(map, cached);
    }
    return cached;
  }, [doc, id]);

  return useSyncExternalStore(subscribe, getSnapshot, () => null);
}

/**
 * The Yjs map behind an element, for reaching its Y.Text or Y.Array.
 *
 * Separate from useElement because that one returns a rebuilt plain object,
 * while this returns the live type — whose identity is stable, which is what
 * makes it safe to pass to useYText and to observe directly.
 */
export function useElementMap(doc: Y.Doc | null, id: string): Y.Map<unknown> | null {
  const subscribe = useCallback(
    (onChange: () => void) => {
      if (!alive(doc)) return NO_OP();
      const els = elements(doc);
      els.observe(onChange);
      return () => els.unobserve(onChange);
    },
    [doc],
  );

  const getSnapshot = useCallback(
    () => (alive(doc) ? (elements(doc).get(id) ?? null) : null),
    [doc, id],
  );

  return useSyncExternalStore(subscribe, getSnapshot, () => null);
}

/** A Y.Text as a plain string, re-read whenever anyone edits it. */
export function useYText(text: Y.Text | null): string {
  const subscribe = useCallback(
    (onChange: () => void) => {
      if (!text) return NO_OP();
      const fire = () => {
        textCache.delete(text);
        onChange();
      };
      text.observe(fire);
      return () => text.unobserve(fire);
    },
    [text],
  );

  const getSnapshot = useCallback(() => {
    if (!text) return "";
    let cached = textCache.get(text);
    if (cached === undefined) {
      // A peer can delete the element out from under an open editor; reading a
      // detached type must not take the board down with it.
      try {
        cached = text.toString();
      } catch {
        cached = "";
      }
      textCache.set(text, cached);
    }
    return cached;
  }, [text]);

  return useSyncExternalStore(subscribe, getSnapshot, () => "");
}
