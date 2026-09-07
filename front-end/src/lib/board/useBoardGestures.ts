"use client";

// Every pointer, wheel and key event on the canvas, in one place.
//
// One pointerdown path, because there is only one pointer: it either pans the
// camera or it goes to the active tool, and having two hooks both try to claim
// it would be a race. The tool half is supplied by the caller as `begin`, so
// this file never has to know what a sticky note is.

import { useEffect, useEffectEvent, useRef, type RefObject } from "react";
import {
  panBy,
  screenToBoard,
  zoomAt,
  type Point,
  type ViewportStore,
} from "./viewport";

/** What a tool hands back when it takes a drag. */
export type DragHandlers = {
  /**
   * @param point where the pointer is now.
   * @param samples every position since the last move, coalesced by the
   * browser and converted here. A 240Hz pen delivers several per frame, and the
   * pen tool wants all of them; everything else can ignore this and use `point`.
   */
  move: (point: Point, samples: readonly Point[]) => void;
  end: (point: Point, event: PointerEvent) => void;
  /** The browser took the pointer away, or the gesture was abandoned. */
  cancel?: () => void;
};

export type BeginDrag = (
  point: Point,
  event: PointerEvent,
) => DragHandlers | null;

type Gesture =
  | { kind: "pan"; pointerId: number; lastX: number; lastY: number }
  | { kind: "tool"; pointerId: number; handlers: DragHandlers };

/** A line of wheel delta, for mice that report in lines rather than pixels. */
const LINE_HEIGHT = 16;
const PAGE_HEIGHT = 400;

/** Tuned so one notch of a mouse wheel is a comfortable zoom step. */
const ZOOM_SENSITIVITY = 0.01;

/**
 * Chrome floating over the canvas — the toolbar and its popovers.
 *
 * The canvas fills the window and its own children are decoration, so a press
 * anywhere over it is normally the board's. Anything marked with this is not:
 * without the exemption the gesture layer takes pointer capture on mousedown,
 * the button never receives its own mouseup, and the click never happens.
 */
export const CHROME_ATTR = "data-board-chrome";

export function isChrome(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest(`[${CHROME_ATTR}]`) !== null;
}

/** Anywhere a keystroke means a character rather than a command. */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.isContentEditable ||
    target.tagName === "INPUT" ||
    target.tagName === "TEXTAREA" ||
    target.tagName === "SELECT"
  );
}

/** Wheel deltas arrive in pixels, lines or pages depending on the device. */
function deltaPixels(event: WheelEvent): { x: number; y: number } {
  const unit =
    event.deltaMode === 1 ? LINE_HEIGHT : event.deltaMode === 2 ? PAGE_HEIGHT : 1;
  return { x: event.deltaX * unit, y: event.deltaY * unit };
}

export function useBoardGestures({
  hostRef,
  store,
  begin,
  panOnly = false,
  onSpaceChange,
  onHover,
}: {
  hostRef: RefObject<HTMLElement | null>;
  store: ViewportStore;
  /** The active tool's chance to take the drag. Omitted or null-returning means pan. */
  begin?: BeginDrag;
  /** True while the Hand tool is selected, so a plain drag pans. */
  panOnly?: boolean;
  /** Told when space is held, so the cursor can change to a grab hand. */
  onSpaceChange?: (held: boolean) => void;
  /**
   * Every pointer position in board coordinates, and null when it leaves.
   * Lives here rather than on an onPointerMove prop so it shares the cached
   * bounds instead of forcing its own layout read per sample.
   */
  onHover?: (point: Point | null) => void;
}) {
  // The listeners below are attached once and stay for the component's whole
  // life — re-binding a native wheel listener on every render would drop events
  // between the remove and the add. These read the current props at event time
  // without being part of the effect's dependencies.
  const beginDrag = useEffectEvent(
    (point: Point, event: PointerEvent) => begin?.(point, event) ?? null,
  );
  const isPanOnly = useEffectEvent(() => panOnly);
  const reportSpace = useEffectEvent((held: boolean) => onSpaceChange?.(held));
  const reportHover = useEffectEvent((point: Point | null) => onHover?.(point));

  const spaceRef = useRef(false);
  const gestureRef = useRef<Gesture | null>(null);
  const boundsRef = useRef<DOMRect | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    // The host's position only changes on resize or when the reconnect bar
    // appears and shrinks it, so this is measured then rather than per pointer
    // sample — a getBoundingClientRect() per move is a forced layout read.
    const measure = () => {
      boundsRef.current = host.getBoundingClientRect();
    };
    measure();

    const observer = new ResizeObserver(measure);
    observer.observe(host);
    window.addEventListener("scroll", measure, true);
    window.addEventListener("resize", measure);

    const toBoard = (event: { clientX: number; clientY: number }): Point => {
      const bounds = boundsRef.current ?? host.getBoundingClientRect();
      return screenToBoard(
        { x: event.clientX - bounds.left, y: event.clientY - bounds.top },
        store.getSnapshot(),
      );
    };

    const toCanvas = (event: { clientX: number; clientY: number }): Point => {
      const bounds = boundsRef.current ?? host.getBoundingClientRect();
      return { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
    };

    // --- Wheel -------------------------------------------------------------
    //
    // Attached natively rather than through onWheel, because React registers
    // wheel as a PASSIVE listener — preventDefault() inside an onWheel prop is
    // silently ignored, and ctrl+wheel would zoom the whole browser page on top
    // of the canvas.
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const delta = deltaPixels(event);

      // Trackpads report a pinch as ctrl+wheel, which is also the conventional
      // mouse-wheel zoom modifier, so one branch covers both.
      if (event.ctrlKey || event.metaKey) {
        store.set((current) =>
          zoomAt(current, Math.exp(-delta.y * ZOOM_SENSITIVITY), toCanvas(event)),
        );
        return;
      }
      store.set((current) => panBy(current, -delta.x, -delta.y));
    };

    // --- Pointer -----------------------------------------------------------
    const finish = (gesture: Gesture, event: PointerEvent, cancelled: boolean) => {
      gestureRef.current = null;
      if (host.hasPointerCapture(event.pointerId)) {
        host.releasePointerCapture(event.pointerId);
      }
      if (gesture.kind !== "tool") return;
      if (cancelled) gesture.handlers.cancel?.();
      else gesture.handlers.end(toBoard(event), event);
    };

    const onPointerDown = (event: PointerEvent) => {
      if (gestureRef.current) return;
      // Presses on the toolbar, a popover, or an open text editor belong to
      // them, not to the board.
      if (isChrome(event.target) || isTypingTarget(event.target)) return;
      // Right-click is left alone: there is no canvas context menu, so let the
      // browser's own appear rather than swallowing it.
      if (event.button === 2) return;

      const wantsPan = event.button === 1 || spaceRef.current || isPanOnly();

      // Windows autoscroll hijacks the middle button unless this is stopped.
      if (event.button === 1) event.preventDefault();

      const gesture: Gesture | null = wantsPan
        ? { kind: "pan", pointerId: event.pointerId, lastX: event.clientX, lastY: event.clientY }
        : (() => {
            const handlers = beginDrag(toBoard(event), event);
            return handlers ? { kind: "tool", pointerId: event.pointerId, handlers } : null;
          })();

      if (!gesture) return;

      gestureRef.current = gesture;
      // Without capture the drag dies the moment the pointer crosses the
      // toolbar or leaves the window.
      host.setPointerCapture(event.pointerId);
      host.focus({ preventScroll: true });
    };

    const onPointerMove = (event: PointerEvent) => {
      reportHover(toBoard(event));

      const gesture = gestureRef.current;
      if (!gesture || gesture.pointerId !== event.pointerId) return;

      if (gesture.kind === "pan") {
        store.set((current) =>
          panBy(current, event.clientX - gesture.lastX, event.clientY - gesture.lastY),
        );
        gesture.lastX = event.clientX;
        gesture.lastY = event.clientY;
        return;
      }
      // getCoalescedEvents is what keeps a high-rate stylus from being
      // decimated to the frame rate before the pen tool ever sees it.
      const raw = event.getCoalescedEvents?.() ?? [];
      const samples = (raw.length > 0 ? raw : [event]).map(toBoard);
      gesture.handlers.move(samples[samples.length - 1], samples);
    };

    const onPointerUp = (event: PointerEvent) => {
      const gesture = gestureRef.current;
      if (!gesture || gesture.pointerId !== event.pointerId) return;
      finish(gesture, event, false);
    };

    // Suppressed while the pointer is captured, which is what we want: a drag
    // that strays outside the canvas should not retract your cursor for peers.
    const onPointerLeave = () => reportHover(null);

    const onPointerCancel = (event: PointerEvent) => {
      const gesture = gestureRef.current;
      if (!gesture || gesture.pointerId !== event.pointerId) return;
      finish(gesture, event, true);
    };

    // The browser can revoke capture on its own — a native gesture starting, or
    // the tab losing focus. Without this the board stays stuck mid-drag.
    const onLostCapture = (event: PointerEvent) => {
      const gesture = gestureRef.current;
      if (!gesture || gesture.pointerId !== event.pointerId) return;
      gestureRef.current = null;
      if (gesture.kind === "tool") gesture.handlers.cancel?.();
    };

    // --- Space to pan ------------------------------------------------------
    const setSpace = (held: boolean) => {
      if (spaceRef.current === held) return;
      spaceRef.current = held;
      reportSpace(held);
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.code !== "Space" || isTypingTarget(event.target)) return;
      // Otherwise space scrolls the page behind the board.
      event.preventDefault();
      setSpace(true);
    };

    const onKeyUp = (event: KeyboardEvent) => {
      if (event.code === "Space") setSpace(false);
    };

    // Alt-tabbing while space is held would otherwise leave the board stuck in
    // pan mode with no way to notice, since the keyup lands in another window.
    const onBlur = () => setSpace(false);

    host.addEventListener("wheel", onWheel, { passive: false });
    host.addEventListener("pointerdown", onPointerDown);
    host.addEventListener("pointermove", onPointerMove);
    host.addEventListener("pointerup", onPointerUp);
    host.addEventListener("pointerleave", onPointerLeave);
    host.addEventListener("pointercancel", onPointerCancel);
    host.addEventListener("lostpointercapture", onLostCapture);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);

    return () => {
      observer.disconnect();
      window.removeEventListener("scroll", measure, true);
      window.removeEventListener("resize", measure);
      host.removeEventListener("wheel", onWheel);
      host.removeEventListener("pointerdown", onPointerDown);
      host.removeEventListener("pointermove", onPointerMove);
      host.removeEventListener("pointerup", onPointerUp);
      host.removeEventListener("pointerleave", onPointerLeave);
      host.removeEventListener("pointercancel", onPointerCancel);
      host.removeEventListener("lostpointercapture", onLostCapture);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
      gestureRef.current = null;
    };
  }, [hostRef, store]);
}
