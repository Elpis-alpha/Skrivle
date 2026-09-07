"use client";

// STYLE_GUIDE.md §4.2 — full-bleed canvas, chrome floating over it. Nothing
// docks or takes layout width from the canvas.
//
// This owns the two pieces of state the tools run on: the camera (a store, not
// React state — see viewport.ts) and the Yjs document (already live). It wires
// pointer input to one and renders the other.

import { useCallback, useReducer, useRef, useState } from "react";
import Link from "next/link";
import { AvatarCluster } from "@/components/board/AvatarCluster";
import { CameraLayer } from "@/components/board/CameraLayer";
import { ConnectionBar } from "@/components/board/ConnectionBar";
import { ElementLayer } from "@/components/board/ElementLayer";
import { SelectionLayer } from "@/components/board/SelectionLayer";
import { Toolbar } from "@/components/board/Toolbar";
import { ExpiryChip } from "@/components/board/ExpiryChip";
import { PresenceLayer } from "@/components/board/PresenceLayer";
import { BoardExpired, BoardNotFound } from "@/components/board/BoardStates";
import { Button } from "@/components/ui/Button";
import type { BoardWithRole } from "@/lib/api/types";
import { displayNameFor } from "@/lib/board/guest-name";
import { readElement, removeElements, updateElement } from "@/lib/board/elements";
import { isChrome, isTypingTarget, useBoardGestures } from "@/lib/board/useBoardGestures";
import { useBoardTools } from "@/lib/board/useBoardTools";
import { useThumbnail } from "@/lib/board/useThumbnail";
import {
  INITIAL_TOOL_STATE,
  styleFieldsFor,
  toolForKey,
  toolReducer,
  type BoardStyle,
} from "@/lib/board/tools";
import { elements } from "@/lib/realtime/doc-schema";
import { createViewportStore } from "@/lib/board/viewport";
import { useBoardDoc } from "@/lib/realtime/useBoardDoc";
import { useUndo } from "@/lib/realtime/useUndo";
import { useSession } from "@/lib/session/SessionProvider";

/** The pointer tells you what the next press will do. */
function cursorFor(tool: string, grabbing: boolean): string {
  if (grabbing || tool === "pan") return "cursor-grab";
  if (tool === "select") return "cursor-default";
  if (tool === "text") return "cursor-text";
  return "cursor-crosshair";
}

export function BoardSurface({
  board,
  onBoardChange,
}: {
  board: BoardWithRole;
  onBoardChange: (board: BoardWithRole) => void;
}) {
  const { user } = useSession();
  const hostRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const marqueeRef = useRef<HTMLDivElement>(null);

  // One store for the component's life. Created lazily so StrictMode's double
  // render doesn't make two of them.
  const [viewport] = useState(createViewportStore);
  const [grabbing, setGrabbing] = useState(false);
  const [tools, dispatch] = useReducer(toolReducer, INITIAL_TOOL_STATE);

  // Never empty: the gateway's `user?.name ?? guestName ?? "Guest"` can't fall
  // through to "Guest", because guestName defaults to "" — which isn't nullish.
  //
  // Computed rather than held in state: this component only renders once the
  // metadata fetch has resolved, so it never takes part in hydration and
  // reading localStorage here is safe.
  const name = displayNameFor(user);

  const endEdit = useCallback(() => {
    dispatch({ type: "edit", id: null });
    // The editor is about to unmount; without this, focus falls to the body and
    // the tool shortcuts stop responding until the canvas is clicked again.
    hostRef.current?.focus({ preventScroll: true });
  }, []);

  // The canvas manages its own focus. A press either starts a gesture, which
  // focuses the canvas, or opens a text editor, which focuses its own field —
  // and letting the browser ALSO focus the canvas (it is tabbable, for the
  // shortcuts) would blur a new note's textarea in the same tick it mounted.
  // Presses inside a field are left alone so clicking into a note still places
  // the caret.
  const onMouseDown = useCallback((event: React.MouseEvent) => {
    if (!isTypingTarget(event.target) && !isChrome(event.target)) event.preventDefault();
  }, []);

  const { doc, status, hydrated, refusal, self, peers, setCursor } = useBoardDoc({
    boardId: board.id,
    name,
    avatarUrl: user?.avatarUrl ?? null,
  });

  // A style change does two things: it sets what the next element will look
  // like, and it repaints whatever is selected right now. Only the fields the
  // change actually touched, and only the ones that mean anything to each kind
  // — see styleFieldsFor.
  const onStyleChange = useCallback(
    (patch: Partial<BoardStyle>) => {
      dispatch({ type: "style", patch });
      if (!doc || tools.selection.length === 0) return;

      const resolved = { ...tools.style, ...patch };
      for (const id of tools.selection) {
        const map = elements(doc).get(id);
        if (!map) continue;
        const fields = styleFieldsFor(readElement(id, map).kind, patch, resolved);
        if (Object.keys(fields).length > 0) updateElement(doc, id, fields);
      }
    },
    [doc, tools.selection, tools.style],
  );

  const { undo, redo, stopCapturing } = useUndo(doc);
  useThumbnail(doc, board.id);

  const { begin, draggingIds } = useBoardTools({
    doc,
    hostRef,
    marqueeRef,
    store: viewport,
    state: tools,
    dispatch,
    onGestureStart: stopCapturing,
  });

  useBoardGestures({
    hostRef,
    store: viewport,
    begin,
    panOnly: tools.tool === "pan",
    onSpaceChange: setGrabbing,
    onHover: setCursor,
  });

  // Shortcuts are bound to the canvas rather than the window, because the board
  // title and every note's textarea are also on this page — a window listener
  // would turn typing "n" into a new sticky note. The textarea additionally
  // stops propagation, so keys never reach here while someone is writing.
  const onKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey) {
        const key = event.key.toLowerCase();
        // Never reached while typing: the textarea stops propagation, so a note
        // keeps its own native undo stack rather than fighting this one.
        if (key === "z") {
          event.preventDefault();
          if (event.shiftKey) redo();
          else undo();
        } else if (key === "y") {
          event.preventDefault();
          redo();
        }
        return;
      }
      if (event.altKey) return;

      if (event.key === "Escape") {
        dispatch({ type: "clear" });
        return;
      }

      if (event.key === "Delete" || event.key === "Backspace") {
        if (!doc || tools.selection.length === 0) return;
        event.preventDefault();
        // Its own undo entry, not merged with whatever came before it.
        stopCapturing();
        removeElements(doc, tools.selection);
        dispatch({ type: "gone", ids: tools.selection });
        return;
      }

      const tool = toolForKey(event.key);
      if (tool) {
        event.preventDefault();
        dispatch({ type: "tool", tool });
      }
    },
    [doc, tools.selection, undo, redo, stopCapturing],
  );

  // A board that vanished while we were looking at it. The REST fetch already
  // covered the load-time cases; this catches expiry mid-session.
  if (refusal?.reason === "board_expired") return <BoardExpired />;
  if (refusal?.reason === "board_not_found") return <BoardNotFound id={board.id} />;

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-canvas">
      {/* §10.12 top bar, 56px */}
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border bg-surface px-4">
        <Link
          href="/"
          className="wordmark shrink-0 rounded-sm text-md text-ink focus-visible:focus-ring"
        >
          skrivle
        </Link>
        <h1 className="truncate text-sm font-medium text-ink">{board.title}</h1>

        <ExpiryChip
          board={board}
          onExtended={(expiresAt) => onBoardChange({ ...board, expiresAt })}
        />

        <div className="ml-auto flex shrink-0 items-center gap-3">
          <AvatarCluster self={self} peers={peers} />
          {user ? (
            <Button href="/boards" variant="ghost" size="sm">
              My boards
            </Button>
          ) : (
            <Button href={`/signin?next=/board/${board.id}`} variant="primary" size="sm">
              Sign in
            </Button>
          )}
        </div>
      </header>

      <ConnectionBar status={status} />

      {/* §7 settle: the canvas starts flat and lifts once the doc is ready.
          This is the only non-user-triggered animation in the product.
          Reduced motion is handled globally in globals.css. */}
      <div
        ref={hostRef}
        data-testid="board-canvas"
        data-settled={hydrated ? "true" : "false"}
        tabIndex={0}
        aria-label="Board canvas"
        onKeyDown={onKeyDown}
        onMouseDown={onMouseDown}
        className={
          "relative flex-1 touch-none select-none overflow-hidden overscroll-contain " +
          "outline-none transition-colors duration-200 ease-standard " +
          "focus-visible:focus-ring " +
          (hydrated ? "bg-canvas " : "bg-wg-50 ") +
          cursorFor(tools.tool, grabbing)
        }
      >
        {/* Two layers: the outer one carries the settle fade, the inner one is
            driven by the camera (§4.4 — the grid tracks the pan and fades out
            below ~40% zoom). Keeping them apart means neither fights the other
            for the opacity property. */}
        <div
          className={
            "pointer-events-none absolute inset-0 transition-opacity duration-200 ease-standard " +
            (hydrated ? "opacity-100" : "opacity-0")
          }
          aria-hidden
        >
          <div ref={gridRef} className="dot-grid absolute inset-0" />
        </div>

        <CameraLayer store={viewport} gridRef={gridRef}>
          {doc ? (
            <>
              <ElementLayer
                doc={doc}
                editingId={tools.editingId}
                draggingIds={draggingIds}
                onEndEdit={endEdit}
                hydrated={hydrated}
              />
              <SelectionLayer doc={doc} ids={tools.selection} marqueeRef={marqueeRef} />
            </>
          ) : null}

          {/* Cursors paint above the work they are pointing at. */}
          <PresenceLayer peers={peers} />
        </CameraLayer>

        <Toolbar
          value={tools.tool}
          style={tools.style}
          onStyleChange={onStyleChange}
          onChange={(tool) => {
            dispatch({ type: "tool", tool });
            // Pressing a tool moves focus into the toolbar; the shortcuts live
            // on the canvas, so hand it straight back.
            hostRef.current?.focus({ preventScroll: true });
          }}
        />
      </div>
    </div>
  );
}
