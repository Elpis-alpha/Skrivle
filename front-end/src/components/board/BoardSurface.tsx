"use client";

// STYLE_GUIDE.md §4.2 — full-bleed canvas, chrome floating over it. Nothing
// docks or takes layout width from the canvas.
//
// This owns the two pieces of state the tools run on: the camera (a store, not
// React state — see viewport.ts) and the Yjs document (already live). It wires
// pointer input to one and renders the other.

import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import Link from "next/link";
import { Share2 } from "lucide-react";
import { AvatarCluster } from "@/components/board/AvatarCluster";
import { CameraLayer } from "@/components/board/CameraLayer";
import { ConnectionBar } from "@/components/board/ConnectionBar";
import { ElementLayer } from "@/components/board/ElementLayer";
import { SelectionLayer } from "@/components/board/SelectionLayer";
import { Toolbar } from "@/components/board/Toolbar";
import { ExpiryChip } from "@/components/board/ExpiryChip";
import { PeerSelectionLayer } from "@/components/board/PeerSelectionLayer";
import { PresenceLayer } from "@/components/board/PresenceLayer";
import { ShareDialog } from "@/components/board/ShareDialog";
import { ZoomControl } from "@/components/board/ZoomControl";
import { BoardExpired, BoardNotFound } from "@/components/board/BoardStates";
import { BoardTitle } from "@/components/board/BoardTitle";
import { EmptyBoardHint } from "@/components/board/EmptyBoardHint";
import { Button } from "@/components/ui/Button";
import type { BoardWithRole } from "@/lib/api/types";
import { displayNameFor } from "@/lib/board/guest-name";
import { centredOn, copyPayload, nudged, parsePayload } from "@/lib/board/clipboard";
import {
  insertElements,
  readElement,
  removeElements,
  updateElement,
  type ElementInit,
} from "@/lib/board/elements";
import type { Point } from "@/lib/board/geometry";
import { isChrome, isTypingTarget, useBoardGestures } from "@/lib/board/useBoardGestures";
import { createPreviewStore } from "@/lib/board/preview";
import { useBoardTools } from "@/lib/board/useBoardTools";
import { useCamera } from "@/lib/board/useCamera";
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

/** How far a duplicate, or a paste with nowhere better to go, sits from what it copied. */
const COPY_NUDGE = 16;

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
  const [preview] = useState(createPreviewStore);
  const [grabbing, setGrabbing] = useState(false);
  const [tools, dispatch] = useReducer(toolReducer, INITIAL_TOOL_STATE);
  const [sharing, setSharing] = useState(false);

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

  const { doc, status, hydrated, refusal, self, peers, setCursor, setSelection } = useBoardDoc({
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

  // Peers see what you have selected (PeerSelectionLayer). Republished when
  // the session is replaced too — signing in mid-board opens a new one, and it
  // starts out publishing nothing.
  useEffect(() => {
    setSelection(tools.selection);
  }, [tools.selection, doc, setSelection]);

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
    preview,
  });

  const camera = useCamera({ doc, store: viewport, hostRef, hydrated });

  // Where the pointer last was on the board, so a paste lands under it. Null
  // once it leaves the canvas.
  const lastPointer = useRef<Point | null>(null);
  const onHover = useCallback(
    (point: Point | null) => {
      lastPointer.current = point;
      setCursor(point);
    },
    [setCursor],
  );

  useBoardGestures({
    hostRef,
    store: viewport,
    begin,
    panOnly: tools.tool === "pan",
    onSpaceChange: setGrabbing,
    onHover,
  });

  // Paste and duplicate: new elements on top, selected, as their own undo step.
  const insertAndSelect = useCallback(
    (inits: readonly ElementInit[]) => {
      if (!doc || inits.length === 0) return;
      stopCapturing();
      const ids = insertElements(doc, inits);
      dispatch({ type: "tool", tool: "select" });
      dispatch({ type: "select", ids });
    },
    [doc, stopCapturing],
  );

  // Copy and paste ride the browser's own clipboard events rather than the
  // async Clipboard API: they need no permission, carry across tabs and
  // boards, and also answer the Edit menu. A note's textarea keeps its own —
  // its events bubble up here, and are left alone.
  const onCopy = useCallback(
    (event: React.ClipboardEvent) => {
      if (isTypingTarget(event.target) || !doc || tools.selection.length === 0) return;
      event.preventDefault();
      event.clipboardData.setData("text/plain", copyPayload(doc, tools.selection));
    },
    [doc, tools.selection],
  );

  // Pasting twice without moving the pointer would stack the copies exactly;
  // each repeat steps down and right instead.
  const lastPaste = useRef<{ at: Point; repeats: number } | null>(null);
  const onPaste = useCallback(
    (event: React.ClipboardEvent) => {
      if (isTypingTarget(event.target)) return;
      const inits = parsePayload(event.clipboardData.getData("text/plain"));
      if (!inits || inits.length === 0) return;
      event.preventDefault();

      const at = lastPointer.current;
      if (!at) {
        insertAndSelect(nudged(inits, COPY_NUDGE));
        return;
      }
      const again = lastPaste.current?.at.x === at.x && lastPaste.current.at.y === at.y;
      const repeats = again ? lastPaste.current!.repeats + 1 : 0;
      lastPaste.current = { at, repeats };
      insertAndSelect(nudged(centredOn(inits, at), COPY_NUDGE * repeats));
    },
    [insertAndSelect],
  );

  // Shortcuts are bound to the canvas rather than the window, because the board
  // title and every note's textarea are also on this page — a window listener
  // would turn typing "n" into a new sticky note. The textarea additionally
  // stops propagation, so keys never reach here while someone is writing.
  const onKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey) {
        const key = event.key.toLowerCase();
        // Zoom keys, taken from the browser's page zoom while the canvas has
        // focus — zooming the page around a zoomable canvas is never wanted.
        if (key === "=" || key === "+") {
          event.preventDefault();
          camera.zoomIn();
          return;
        }
        if (key === "-") {
          event.preventDefault();
          camera.zoomOut();
          return;
        }
        // Duplicate — and not the browser's "bookmark this page".
        if (key === "d") {
          event.preventDefault();
          if (doc && tools.selection.length > 0) {
            const copy = parsePayload(copyPayload(doc, tools.selection)) ?? [];
            insertAndSelect(nudged(copy, COPY_NUDGE));
          }
          return;
        }
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

      // By physical key: Shift+1 is "!" on one layout and something else on
      // the next, but it is always Digit1.
      if (event.shiftKey && event.code === "Digit1") {
        event.preventDefault();
        camera.fit();
        return;
      }
      if (event.shiftKey && event.code === "Digit0") {
        event.preventDefault();
        camera.resetZoom();
        return;
      }

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
    [doc, tools.selection, undo, redo, stopCapturing, camera, insertAndSelect],
  );

  // A board that vanished while we were looking at it. The REST fetch already
  // covered the load-time cases; this catches expiry mid-session.
  if (refusal?.reason === "board_expired") return <BoardExpired />;
  if (refusal?.reason === "board_not_found") return <BoardNotFound id={board.id} />;

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-canvas">
      {/* §10.12 top bar, 56px. overflow-x-auto is a safety net, not the fix:
          the title's min-w-12 floor plus ExpiryChip's own responsive collapse
          (see that file) cover every realistic case at 360px. This only
          catches what's left — several concurrent collaborators plus a long
          title on the narrowest phones — by making the excess reachable with
          a swipe instead of letting it clip past the viewport unreachably, the
          way it did before either fix. It's inert (no visible scrollbar,
          nothing shifts) whenever content already fits, which is every normal
          case. */}
      <header className="flex h-14 shrink-0 items-center gap-3 overflow-x-auto border-b border-border bg-surface px-4 max-sm:gap-2">
        <Link
          href="/"
          className="wordmark shrink-0 rounded-sm text-md text-ink focus-visible:focus-ring"
        >
          skrivle
        </Link>
        <BoardTitle board={board} onRenamed={onBoardChange} />

        <ExpiryChip
          board={board}
          onExtended={(expiresAt) => onBoardChange({ ...board, expiresAt })}
        />

        {/* Tighter below sm: the Share button is the one thing a phone's bar
            can't lose, and at 360px the regular gaps cost it the last few px. */}
        <div className="ml-auto flex shrink-0 items-center gap-3 max-sm:gap-2">
          <AvatarCluster self={self} peers={peers} />
          {/* §10.12 — Share is secondary; the label drops to an icon on the
              narrowest phones, where the bar is already full. */}
          <Button variant="secondary" size="sm" onClick={() => setSharing(true)}>
            <Share2 size={16} strokeWidth={1.5} aria-hidden />
            <span className="max-sm:sr-only">Share</span>
          </Button>
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

      <ShareDialog
        open={sharing}
        onClose={() => setSharing(false)}
        boardId={board.id}
        guest={!user}
      />

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
        onCopy={onCopy}
        onPaste={onPaste}
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
                preview={preview}
              />
              {/* Everyone else's selections sit under your own, which is the
                  one with handles you can grab. */}
              <PeerSelectionLayer doc={doc} peers={peers} preview={preview} />
              <SelectionLayer
                doc={doc}
                ids={tools.selection}
                marqueeRef={marqueeRef}
                preview={preview}
              />
            </>
          ) : null}

          {/* Cursors paint above the work they are pointing at. */}
          <PresenceLayer peers={peers} />
        </CameraLayer>

        <EmptyBoardHint doc={doc} hydrated={hydrated} boardId={board.id} />

        <ZoomControl store={viewport} actions={camera} />

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
