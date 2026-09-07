"use client";

// STYLE_GUIDE.md §10.14 — email first: an email field, then a one-time-code
// step; below an "or" divider, the two OAuth providers. Nothing is wired to the
// back-end yet (see back-end/src/http/routes/auth.ts).

import { OTPInput, REGEXP_ONLY_DIGITS, type SlotProps } from "input-otp";
import { useId, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/Button";

type Step = "email" | "code";

const CODE_LENGTH = 6;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const FIELD_BASE =
  "mt-2 h-10 w-full rounded-sm border bg-surface px-3 text-base text-ink " +
  "outline-none transition-shadow duration-(--dur-fast) ease-standard " +
  "placeholder:text-ink-muted focus:shadow-[0_0_0_3px_var(--accent-subtle)]";

export function SignInForm() {
  const emailId = useId();
  const codeId = useId();
  const errorId = useId();
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);

  function onEmailSubmit(event: FormEvent) {
    event.preventDefault();
    if (!EMAIL_RE.test(email.trim())) {
      setError("Enter an email address so we can send a code.");
      return;
    }
    setError(null);
    // TODO(Phase 1): POST /api/auth/email/request, then advance on success.
    setStep("code");
  }

  function onCodeSubmit(event: FormEvent) {
    event.preventDefault();
    // TODO(Phase 1): POST /api/auth/email/verify { email, code }.
  }

  return (
    <div className="mt-6 flex flex-col gap-4">
      {step === "email" ? (
        <form onSubmit={onEmailSubmit} noValidate>
          <label htmlFor={emailId} className="text-sm font-medium text-ink">
            Email
          </label>
          <input
            id={emailId}
            type="email"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              if (error) setError(null);
            }}
            placeholder="you@example.com"
            autoComplete="email"
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? errorId : undefined}
            className={
              FIELD_BASE +
              " " +
              (error
                ? "border-danger focus:border-danger"
                : "border-border focus:border-accent")
            }
          />
          {error ? (
            <p id={errorId} role="alert" className="mt-2 text-xs text-danger">
              {error}
            </p>
          ) : null}
          <Button
            type="submit"
            variant="primary"
            size="md"
            className="mt-3 w-full"
          >
            Continue with email
          </Button>
        </form>
      ) : (
        <form onSubmit={onCodeSubmit} noValidate>
          <label htmlFor={codeId} className="text-sm font-medium text-ink">
            Enter the code we emailed to {email}
          </label>
          <OTPInput
            id={codeId}
            value={code}
            onChange={setCode}
            maxLength={CODE_LENGTH}
            pattern={REGEXP_ONLY_DIGITS}
            autoComplete="one-time-code"
            aria-label="One-time code"
            aria-describedby={`${codeId}-hint`}
            containerClassName="mt-2 flex items-center gap-2"
            render={({ slots }) => (
              <>
                {slots.map((slot, i) => (
                  <CodeSlot key={i} {...slot} />
                ))}
              </>
            )}
          />
          <p id={`${codeId}-hint`} className="mt-2 text-xs text-ink-muted">
            Six digits, from the email. Didn&apos;t get it?{" "}
            <button
              type="button"
              className="rounded-sm underline decoration-border underline-offset-4 hover:decoration-accent focus-visible:focus-ring"
            >
              Resend code
            </button>
          </p>
          <Button
            type="submit"
            variant="primary"
            size="md"
            className="mt-3 w-full"
            disabled={code.length !== CODE_LENGTH}
          >
            Verify and sign in
          </Button>
          <p className="mt-2 text-xs text-ink-muted">
            <button
              type="button"
              onClick={() => {
                setStep("email");
                setCode("");
              }}
              className="rounded-sm underline decoration-border underline-offset-4 hover:decoration-accent focus-visible:focus-ring"
            >
              Use a different email
            </button>
          </p>
        </form>
      )}

      <div className="flex items-center gap-3 text-xs text-ink-muted">
        <span className="h-px flex-1 bg-border" />
        or
        <span className="h-px flex-1 bg-border" />
      </div>

      <div className="flex flex-col gap-3">
        <Button variant="secondary" size="md" disabled>
          Continue with GitHub
        </Button>
        <Button variant="secondary" size="md" disabled>
          Continue with Google
        </Button>
      </div>

      <p className="text-xs text-ink-muted">
        Sign-in isn&apos;t wired up yet — it arrives with the board itself.
      </p>
    </div>
  );
}

// A single code box. input-otp keeps one real <input> behind the slots and
// tells us which is active and where the caret sits.
function CodeSlot({ char, isActive, hasFakeCaret }: SlotProps) {
  return (
    <div
      className={
        "relative flex h-11 w-10 items-center justify-center rounded-sm border bg-surface " +
        "text-md tabular-nums text-ink transition-shadow duration-(--dur-fast) ease-standard " +
        (isActive
          ? "border-accent shadow-[0_0_0_3px_var(--accent-subtle)]"
          : "border-border")
      }
    >
      {char}
      {hasFakeCaret ? (
        <span className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <span className="h-5 w-px animate-pulse bg-ink" />
        </span>
      ) : null}
    </div>
  );
}
