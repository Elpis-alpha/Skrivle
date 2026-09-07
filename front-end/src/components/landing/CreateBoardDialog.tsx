"use client";

// STYLE_GUIDE.md §10.16 (dialog base) + §10.4 (board-id field) + §10.3 (text
// field). The one-click NewBoardButton path skips all of this; this is the
// "choose your own id and title" option behind its chevron.

import { Check, Loader2, X } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
  type FormEvent,
} from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/Button";
import { checkBoardIdAvailable, createBoard } from "@/lib/api/boards";
import { isApiError } from "@/lib/api/errors";
import type { CreatedBoard } from "@/lib/api/types";
import { isValidCustomId } from "@/lib/board-id";

// Same treatment as SiteHeader's mobile panel (§10.16's entrance, applied
// consistently): scrim fade + 8px rise, --dur-slow. Reduced-motion → fade only.
const ENTER_EASE = [0.3, 0, 0, 1] as const; // --ease-entrance
const EXIT_EASE = [0.2, 0, 0, 1] as const; // --ease-standard

const ID_MAX = 32;
const TITLE_MAX = 120;

const FIELD_BASE =
  "mt-2 h-10 w-full rounded-sm border bg-surface px-3 text-base text-ink " +
  "outline-none transition-shadow duration-(--dur-fast) ease-standard " +
  "placeholder:text-ink-muted focus:shadow-[0_0_0_3px_var(--accent-subtle)]";

type Availability = "idle" | "checking" | "available" | "taken" | "invalid";

type Problem = { message: string; next?: string };

function problemFrom(err: unknown): Problem {
  if (isApiError(err)) return { message: err.message, next: err.next };
  return {
    message: "Couldn't create the board.",
    next: "Try again in a moment.",
  };
}

export function CreateBoardDialog({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  /** The caller owns what happens next — storing a creatorToken, navigating. */
  onCreated: (board: CreatedBoard) => void;
}) {
  const titleId = useId();
  const idFieldId = useId();
  const titleFieldId = useId();
  const problemId = useId();
  const reduced = useReducedMotion();

  const triggerFocus = useRef<Element | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const idInputRef = useRef<HTMLInputElement>(null);
  const checkGeneration = useRef(0);

  const [customId, setCustomId] = useState("");
  const [title, setTitle] = useState("");
  const [availability, setAvailability] = useState<Availability>("idle");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<Problem | null>(null);

  // The standard SSR-safe portal gate: `document` doesn't exist on the
  // server, so the server snapshot is false and the client one is true —
  // never actually subscribes to anything, it only needs the framework to
  // tell the two environments apart. `open` is always false on the server
  // anyway (it can only become true from a client click), so this costs
  // nothing visible.
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );

  // A ref write, not state — safe inside an effect, unsafe during render.
  useEffect(() => {
    if (open) triggerFocus.current = document.activeElement;
  }, [open]);

  // Fresh every time the dialog opens — this is a one-shot creation form, not
  // a draft worth preserving between visits. Adjusted during render (the
  // useResource.ts pattern) rather than in an effect, so there is no extra
  // render between "opened" and "form cleared".
  const [openedFor, setOpenedFor] = useState(open);
  if (open !== openedFor) {
    setOpenedFor(open);
    if (open) {
      setCustomId("");
      setTitle("");
      setAvailability("idle");
      setBusy(false);
      setProblem(null);
    }
  }

  const close = useCallback(() => {
    onClose();
    (triggerFocus.current as HTMLElement | null)?.focus?.();
  }, [onClose]);

  // Body scroll lock while open, mirroring SiteHeader's mobile panel: locked
  // the instant it opens, unlocked only once the exit animation actually
  // finishes (the AnimatePresence onExitComplete below) — not the instant
  // `open` flips to false, or the page would jump while the dialog is still
  // visibly fading out. A bare unlock-on-`open`-false effect would never fire
  // at all, since this component stays mounted between opens.
  useEffect(() => {
    if (open) document.body.style.overflow = "hidden";
  }, [open]);
  useEffect(
    () => () => {
      document.body.style.overflow = "";
    },
    [],
  );

  // Esc closes; Tab is kept inside the panel while it's open.
  useEffect(() => {
    if (!open) return;

    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        close();
        return;
      }
      if (event.key !== "Tab") return;

      const focusable = panelRef.current?.querySelectorAll<HTMLElement>(
        "a[href], button:not([disabled]), input:not([disabled])",
      );
      if (!focusable?.length) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;

      if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    }

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, close]);

  // Checked on blur, never per keystroke — GET .../available is rate-limited
  // at 60/min. A generation counter discards a stale reply if the field
  // changed (or was re-blurred) before the previous check landed.
  async function checkId(raw: string) {
    const id = raw.trim();
    if (!id) {
      setAvailability("idle");
      return;
    }
    if (!isValidCustomId(id)) {
      setAvailability("invalid");
      return;
    }

    const generation = ++checkGeneration.current;
    setAvailability("checking");
    try {
      const { available } = await checkBoardIdAvailable(id);
      if (checkGeneration.current !== generation) return;
      setAvailability(available ? "available" : "taken");
    } catch {
      if (checkGeneration.current !== generation) return;
      // The check is an early hint, not the authority — creation re-validates
      // server-side, so a failed probe just falls back to "we'll find out".
      setAvailability("idle");
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy || availability === "checking" || availability === "invalid")
      return;

    const id = customId.trim();
    if (availability === "taken") {
      idInputRef.current?.focus();
      return;
    }

    setBusy(true);
    setProblem(null);
    try {
      const board = await createBoard({
        ...(id ? { customId: id } : {}),
        ...(title.trim() ? { title: title.trim() } : {}),
      });
      onCreated(board);
      onClose();
    } catch (err) {
      // 409 means someone took this id between the blur check and submit —
      // point at the field rather than the generic error line, same copy the
      // server already wrote for exactly this (§10.3: name the fix).
      if (isApiError(err) && err.status === 409 && id) {
        setAvailability("taken");
        setProblem({ message: err.message, next: err.next });
        idInputRef.current?.focus();
      } else {
        setProblem(problemFrom(err));
      }
    } finally {
      setBusy(false);
    }
  }

  const idInvalid = availability === "taken" || availability === "invalid";
  const idHint =
    availability === "invalid"
      ? "3–32 letters, numbers, or hyphens."
      : availability === "taken"
        ? "That id is already taken."
        : "Leave blank and we'll generate one.";

  if (!mounted) return null;

  // Portalled to <body> rather than rendered in place: NewBoardButton is used
  // inside SiteHeader, whose <header> sets backdrop-blur — a non-none
  // backdrop-filter creates a new containing block for `position: fixed`
  // descendants, which would pin this dialog's scrim to the 64px header bar
  // instead of the viewport (the exact bug SiteHeader's own mobile panel
  // comment describes, for the same reason). Portalling also means the
  // dialog is never a DOM descendant of whatever ancestor happened to render
  // the trigger, so it can't inherit stray layout like ClosingCta's
  // `text-center` either.
  //
  // The portal call itself is unconditional — only its content toggles on
  // `open` — because AnimatePresence needs to stay mounted across the
  // open→close transition to run the exit animation at all; portalling only
  // while `open` is true would unmount AnimatePresence in the same instant as
  // its child, skipping the exit entirely.
  return createPortal(
    <AnimatePresence onExitComplete={() => (document.body.style.overflow = "")}>
      {open ? (
        <motion.div
          className="fixed inset-0 z-70 flex items-center justify-center bg-[rgba(26,22,32,0.4)] p-4 backdrop-blur-[2px]"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) close();
          }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1, transition: { duration: reduced ? 0 : 0.18 } }}
          exit={{ opacity: 0, transition: { duration: reduced ? 0 : 0.18 } }}
        >
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            className="w-full max-w-110 rounded-lg bg-surface-raised p-6 shadow-elev-3"
            initial={reduced ? false : { opacity: 0, y: 8 }}
            animate={{
              opacity: 1,
              y: 0,
              transition: { duration: reduced ? 0 : 0.28, ease: ENTER_EASE },
            }}
            exit={{
              opacity: 0,
              y: reduced ? 0 : 8,
              transition: { duration: reduced ? 0 : 0.28, ease: EXIT_EASE },
            }}
          >
            <div className="flex items-start justify-between gap-4">
              <h2 id={titleId} className="text-lg font-semibold text-ink">
                Create a board
              </h2>
              <button
                type="button"
                onClick={close}
                aria-label="Close"
                className={
                  "-m-1.5 inline-flex size-8 shrink-0 items-center justify-center rounded-sm " +
                  "text-ink-secondary hover:bg-wg-50 hover:text-ink focus-visible:focus-ring"
                }
              >
                <X size={18} strokeWidth={1.5} aria-hidden="true" />
              </button>
            </div>

            <form
              onSubmit={(event) => void submit(event)}
              noValidate
              className="mt-4"
            >
              <label
                htmlFor={idFieldId}
                className="text-sm font-medium text-ink"
              >
                Board id
              </label>
              <div
                className={
                  "mt-2 flex h-10 items-center overflow-hidden rounded-sm border bg-surface " +
                  "transition-shadow duration-(--dur-fast) ease-standard focus-within:shadow-[0_0_0_3px_var(--accent-subtle)] " +
                  (idInvalid
                    ? "border-danger focus-within:border-danger"
                    : "border-border focus-within:border-accent")
                }
              >
                <span className="shrink-0 whitespace-nowrap pl-3 text-sm text-ink-muted">
                  {typeof window !== "undefined" ? window.location.origin : ""}
                  /board/
                </span>
                <input
                  ref={idInputRef}
                  id={idFieldId}
                  value={customId}
                  onChange={(event) => {
                    checkGeneration.current++; // stale in-flight checks no longer apply
                    setCustomId(event.target.value);
                    setAvailability("idle");
                    if (problem) setProblem(null);
                  }}
                  onBlur={(event) => void checkId(event.target.value)}
                  maxLength={ID_MAX}
                  autoFocus
                  autoComplete="off"
                  spellCheck={false}
                  placeholder="generated for you"
                  aria-invalid={idInvalid || undefined}
                  aria-describedby={`${idFieldId}-hint`}
                  className="h-full min-w-0 flex-1 bg-transparent pr-2 text-base text-ink outline-none placeholder:text-ink-muted"
                />
                <span
                  className="flex shrink-0 items-center pr-3"
                  aria-hidden="true"
                >
                  {availability === "checking" ? (
                    <Loader2
                      size={16}
                      strokeWidth={2}
                      className="animate-spin text-ink-muted"
                    />
                  ) : availability === "available" ? (
                    <Check size={16} strokeWidth={2} className="text-success" />
                  ) : availability === "taken" ? (
                    <X size={16} strokeWidth={2} className="text-danger" />
                  ) : null}
                </span>
              </div>
              <p
                id={`${idFieldId}-hint`}
                className={
                  "mt-2 text-xs " +
                  (idInvalid ? "text-danger" : "text-ink-muted")
                }
              >
                {idHint}
              </p>

              <label
                htmlFor={titleFieldId}
                className="mt-4 block text-sm font-medium text-ink"
              >
                Title{" "}
                <span className="font-normal text-ink-muted">(optional)</span>
              </label>
              <input
                id={titleFieldId}
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                maxLength={TITLE_MAX}
                placeholder="Untitled board"
                className={FIELD_BASE + " border-border focus:border-accent"}
              />

              {problem ? (
                <p
                  id={problemId}
                  role="alert"
                  className="mt-4 text-xs text-danger"
                >
                  {problem.message}
                  {problem.next ? (
                    <span className="text-ink-muted"> {problem.next}</span>
                  ) : null}
                </p>
              ) : null}

              <div className="mt-6 flex justify-end gap-3">
                <Button type="button" variant="ghost" size="md" onClick={close}>
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  size="md"
                  loading={busy}
                  disabled={availability === "checking" || idInvalid}
                >
                  Create board
                </Button>
              </div>
            </form>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>,
    document.body,
  );
}
