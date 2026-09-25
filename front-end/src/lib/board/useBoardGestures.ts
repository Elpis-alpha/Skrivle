"use client";

// Every pointer, wheel and key event on the canvas, in one place.
//
// One pointerdown path: a press either pans the camera or goes to the active
// tool, and having two hooks both try to claim it would be a race. The tool
// half is supplied by the caller as `begin`, so this file never has to know
// what a sticky note is. The one exception to one-pointer-at-a-time is a
// second finger, which turns whatever the first started into a pinch.

import { useEffect, useEffectEvent, useRef, type RefObject } from "react";
import {
  panBy,
  pinch,
  screenToBoard,
  zoomAt,
  type FingerPair,
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
  /**
   * The gesture didn't happen after all: a second finger made it a pinch, or
   * the browser took the pointer away. Whatever it did is taken back.
   */
  cancel?: () => void;
};

export type BeginDrag = (
  point: Point,
  event: PointerEvent,
) => DragHandlers | null;

type Gesture =
  | { kind: "pan"; pointerId: number; lastX: number; lastY: number }
  | { kind: "tool"; pointerId: number; handlers: DragHandlers }
  | { kind: "pinch"; fingers: readonly [number, number]; last: FingerPair };

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

    // Every finger on the canvas, in canvas pixels. Forgotten on release
    // wherever that lands (see forgetFinger), so a finger lifted off the
    // canvas can't count towards the next pinch.
    const fingers = new Map<number, Point>();

    // Two fingers down: a pinch, whatever the first one had started — a stroke
    // or a shape begun by a finger that was on its way to a pinch is taken
    // back. A pen or mouse drag already under way carries on: fingers arriving
    // then are a palm resting on the screen.
    const startPinch = () => {
      const current = gestureRef.current;
      if (current?.kind === "pinch") return;
      if (current && !fingers.has(current.pointerId)) return;
      if (current?.kind === "tool") current.handlers.cancel?.();

      const [a, b] = [...fingers.keys()];
      gestureRef.current = {
        kind: "pinch",
        fingers: [a, b],
        last: [fingers.get(a)!, fingers.get(b)!],
      };
      for (const id of [a, b]) {
        if (!host.hasPointerCapture(id)) host.setPointerCapture(id);
      }
      host.focus({ preventScroll: true });
    };

    /** Whether this pointer is one of the pinch's two fingers. */
    const pinching = (gesture: Gesture | null, pointerId: number) =>
      gesture?.kind === "pinch" && gesture.fingers.includes(pointerId);

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
      // Presses on the toolbar, a popover, or an open text editor belong to
      // them, not to the board.
      if (isChrome(event.target) || isTypingTarget(event.target)) return;
      // Right-click is left alone: there is no canvas context menu, so let the
      // browser's own appear rather than swallowing it.
      if (event.button === 2) return;

      if (event.pointerType === "touch") {
        fingers.set(event.pointerId, toCanvas(event));
        if (fingers.size >= 2) {
          startPinch();
          return;
        }
      }
      if (gestureRef.current) return;

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
      if (fingers.has(event.pointerId)) fingers.set(event.pointerId, toCanvas(event));
      const gesture = gestureRef.current;

      // Not reported as hover: peers would see the cursor flick between the
      // two fingers.
      if (gesture?.kind === "pinch") {
        if (!pinching(gesture, event.pointerId)) return;
        const [a, b] = gesture.fingers;
        const next: FingerPair = [fingers.get(a)!, fingers.get(b)!];
        store.set((current) => pinch(current, gesture.last, next));
        gesture.last = next;
        return;
      }

      reportHover(toBoard(event));
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

    // Lifting either finger ends a pinch. The one left down does nothing until
    // it lifts too: turning it into a drag would draw wherever it happened to
    // be resting.
    const endPinch = (event: PointerEvent) => {
      if (pinching(gestureRef.current, event.pointerId)) gestureRef.current = null;
    };

    const onPointerUp = (event: PointerEvent) => {
      const gesture = gestureRef.current;
      if (gesture?.kind === "pinch") return endPinch(event);
      if (!gesture || gesture.pointerId !== event.pointerId) return;
      finish(gesture, event, false);
    };

    const forgetFinger = (event: PointerEvent) => fingers.delete(event.pointerId);

    // Suppressed while the pointer is captured, which is what we want: a drag
    // that strays outside the canvas should not retract your cursor for peers.
    const onPointerLeave = () => reportHover(null);

    const onPointerCancel = (event: PointerEvent) => {
      const gesture = gestureRef.current;
      if (gesture?.kind === "pinch") return endPinch(event);
      if (!gesture || gesture.pointerId !== event.pointerId) return;
      finish(gesture, event, true);
    };

    // The browser can revoke capture on its own — a native gesture starting, or
    // the tab losing focus. Without this the board stays stuck mid-drag.
    const onLostCapture = (event: PointerEvent) => {
      const gesture = gestureRef.current;
      if (gesture?.kind === "pinch") return endPinch(event);
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
    window.addEventListener("pointerup", forgetFinger);
    window.addEventListener("pointercancel", forgetFinger);
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
      window.removeEventListener("pointerup", forgetFinger);
      window.removeEventListener("pointercancel", forgetFinger);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
      gestureRef.current = null;
    };
  }, [hostRef, store]);
}
