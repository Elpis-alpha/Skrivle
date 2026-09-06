"use client";

// STYLE_GUIDE.md §10.4 — the board-id field: a static origin prefix, then the
// input. Accepts a bare id or a whole pasted link (see parseBoardRef).

import { useRouter } from "next/navigation";
import { useId, useState, type FormEvent } from "react";
import { parseBoardRef } from "@/lib/board-id";

export function JoinBoardForm() {
  const router = useRouter();
  const inputId = useId();
  const errorId = useId();
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    const result = parseBoardRef(value);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setError(null);
    router.push(`/board/${result.id}`);
  }

  return (
    <form onSubmit={onSubmit} noValidate className="w-full max-w-md">
      <label htmlFor={inputId} className="text-sm font-medium text-ink">
        Already have a link?
      </label>

      <div
        className={
          "mt-2 flex h-10 items-center rounded-sm border bg-surface pl-3 " +
          "transition-shadow duration-(--dur-fast) ease-standard " +
          "focus-within:shadow-[0_0_0_3px_var(--accent-subtle)] " +
          (error
            ? "border-danger focus-within:border-danger"
            : "border-border focus-within:border-accent")
        }
      >
        <span
          className="hidden shrink-0 text-base text-ink-muted select-none sm:inline"
          aria-hidden="true"
        >
          skrivle.elpis.cc/board/
        </span>
        <input
          id={inputId}
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            if (error) setError(null);
          }}
          placeholder="k3m9p"
          autoComplete="off"
          spellCheck={false}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          className="h-full min-w-0 flex-1 bg-transparent px-1 text-base text-ink outline-none placeholder:text-ink-muted"
        />
        <button
          type="submit"
          className={
            "mr-1 h-8 shrink-0 rounded-sm px-3 text-base font-medium text-ink " +
            "transition-colors duration-(--dur-fast) ease-standard " +
            "hover:bg-wg-50 active:bg-wg-100 focus-visible:focus-ring"
          }
        >
          Join
        </button>
      </div>

      {error ? (
        <p id={errorId} role="alert" className="mt-2 text-xs text-danger">
          {error}
        </p>
      ) : null}
    </form>
  );
}
