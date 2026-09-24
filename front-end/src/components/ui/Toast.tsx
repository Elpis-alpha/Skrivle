"use client";

// STYLE_GUIDE.md §10.17 — toast.
//
// "Bottom-center, above the toolbar. --surface, --elev-2, --radius-lg, --ink
// text-sm, one line, 4s auto-dismiss, max 1 visible (queue the rest). Success
// gets a 6px --success dot before the text — not a full green fill. Errors
// persist until dismissed and use --danger text."

import { X } from "lucide-react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

type Tone = "neutral" | "success" | "error";
type Item = { id: number; message: string; tone: Tone };

export type Toaster = {
  show: (message: string, options?: { tone?: Tone }) => void;
};

/** §10.17 — "4s auto-dismiss". */
const AUTO_DISMISS_MS = 4000;

// Outside a provider a toast has nowhere to appear; saying nothing is better
// than taking the page down over a confirmation message.
const ToastContext = createContext<Toaster>({ show: () => {} });

export const useToast = (): Toaster => useContext(ToastContext);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [queue, setQueue] = useState<readonly Item[]>([]);
  const nextId = useRef(0);

  const show = useCallback<Toaster["show"]>((message, options) => {
    const item = { id: nextId.current++, message, tone: options?.tone ?? "neutral" };
    setQueue((current) => [...current, item]);
  }, []);

  const dismiss = useCallback((id: number) => {
    setQueue((current) => current.filter((item) => item.id !== id));
  }, []);

  // §10.17 — max one visible; the rest wait their turn.
  const current = queue[0] ?? null;

  useEffect(() => {
    if (!current || current.tone === "error") return;
    const timer = setTimeout(() => dismiss(current.id), AUTO_DISMISS_MS);
    return () => clearTimeout(timer);
  }, [current, dismiss]);

  const toaster = useMemo(() => ({ show }), [show]);

  return (
    <ToastContext.Provider value={toaster}>
      {children}

      {/* Above the floating toolbar (bottom-6 + its ~48px), never over it. */}
      <div className="pointer-events-none fixed inset-x-0 bottom-24 z-60 flex justify-center px-4">
        {/* The polite region is always in the DOM so screen readers are
            already listening when a message lands in it; an error is
            announced assertively on its own, as it appears. */}
        <div role="status" aria-live="polite">
          {current && current.tone !== "error" ? <Toast key={current.id} item={current} /> : null}
        </div>
        {current?.tone === "error" ? (
          <Toast key={current.id} item={current} onDismiss={() => dismiss(current.id)} />
        ) : null}
      </div>
    </ToastContext.Provider>
  );
}

function Toast({ item, onDismiss }: { item: Item; onDismiss?: () => void }) {
  const error = item.tone === "error";
  return (
    <div
      role={error ? "alert" : undefined}
      className={
        "toast-in pointer-events-auto flex max-w-[min(32rem,calc(100vw-2rem))] items-center gap-2 " +
        "rounded-lg border border-border bg-surface py-2.5 pl-4 text-sm shadow-elev-2 " +
        (error ? "pr-2 text-danger" : "pr-4 text-ink")
      }
    >
      {item.tone === "success" ? (
        <span className="size-1.5 shrink-0 rounded-pill bg-success" aria-hidden />
      ) : null}
      <span className="truncate">{item.message}</span>
      {onDismiss ? (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss"
          className="grid size-7 shrink-0 place-items-center rounded-sm text-ink-secondary hover:bg-wg-50 hover:text-ink focus-visible:focus-ring"
        >
          <X size={16} strokeWidth={1.5} aria-hidden />
        </button>
      ) : null}
    </div>
  );
}
