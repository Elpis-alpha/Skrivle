"use client";

// Undo and redo.
//
// Not in the style guide, and table stakes anyway: a mis-drag on a whiteboard
// with no way back feels broken rather than minimal.
//
// The settings here are all load-bearing and none of them are the defaults.

import { useEffect, useMemo } from "react";
import * as Y from "yjs";
import { LOCAL } from "./board-session";
import { elements, order } from "./doc-schema";

/**
 * Long enough that a gesture is never split in two.
 *
 * The default is 500ms, and writes go out on a throttle, so pausing mid-drag
 * for half a second would end up as two undo entries — one Cmd+Z would leave a
 * note stranded halfway. Gestures call stopCapturing() at their start instead,
 * which makes the boundary deliberate rather than a matter of timing.
 */
const CAPTURE_TIMEOUT = 10_000;

export type Undo = {
  undo: () => void;
  redo: () => void;
  /** Close the current undo entry. Called at the start of every gesture. */
  stopCapturing: () => void;
};

export function useUndo(doc: Y.Doc | null): Undo {
  const manager = useMemo(() => {
    if (!doc || doc.isDestroyed) return null;
    return new Y.UndoManager([elements(doc), order(doc)], {
      // Only this user's own edits. Remote changes arrive under a different
      // origin and are already excluded by default, but naming ours explicitly
      // also keeps a stray untagged transaction — a repair pass, a migration —
      // off the user's undo stack, since Yjs tracks a null origin by default.
      trackedOrigins: new Set([LOCAL]),
      captureTimeout: CAPTURE_TIMEOUT,
      // Without this, undoing your own move of a note that a peer has since
      // moved again reverts THEIR newer position too.
      ignoreRemoteMapChanges: true,
    });
  }, [doc]);

  // The doc is replaced, not mutated, when the session reopens — which signing
  // in mid-board does. The old manager holds observers on a dead document.
  useEffect(() => () => manager?.destroy(), [manager]);

  return useMemo(
    () => ({
      undo: () => manager?.undo(),
      redo: () => manager?.redo(),
      stopCapturing: () => manager?.stopCapturing(),
    }),
    [manager],
  );
}
