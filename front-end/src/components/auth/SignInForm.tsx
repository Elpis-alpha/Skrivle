"use client";

// STYLE_GUIDE.md §10.14 — email first: an email field, then a one-time-code
// step; below an "or" divider, the providers this deployment can serve.
// back-end/src/http/routes/auth.ts

import { OTPInput, REGEXP_ONLY_DIGITS, type SlotProps } from "input-otp";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { OAuthButtons } from "@/components/auth/OAuthButtons";
import { Button } from "@/components/ui/Button";
import { requestEmailCode, sameOriginPath, verifyEmailCode } from "@/lib/api/auth";
import { isApiError } from "@/lib/api/errors";
import { useAuthLanding } from "@/lib/auth/landing";
import { parseBoardRef } from "@/lib/board-id";
import { claimIfPossible } from "@/lib/board/claim";
import { useSession } from "@/lib/session/SessionProvider";

type Step = "email" | "code";

const CODE_LENGTH = 6;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// TTL.otpResendCooldown in back-end/src/redis/keys.ts. It isn't in any
// response, so it has to be mirrored here.
const RESEND_COOLDOWN_SECONDS = 60;

const FIELD_BASE =
  "mt-2 h-10 w-full rounded-sm border bg-surface px-3 text-base text-ink " +
  "outline-none transition-shadow duration-(--dur-fast) ease-standard " +
  "placeholder:text-ink-muted focus:shadow-[0_0_0_3px_var(--accent-subtle)]";

type Problem = { message: string; next?: string };

function problemFrom(err: unknown): Problem {
  if (isApiError(err)) return { message: err.message, next: err.next };
  return { message: "Something went wrong.", next: "Try again in a moment." };
}

export function SignInForm({
  /** Where to go after an emailed-code sign-in. */
  next,
  /** Guest board to claim once signed in. */
  claim,
}: {
  next?: string | null;
  claim?: string | null;
}) {
  const emailId = useId();
  const codeId = useId();
  const errorId = useId();
  const router = useRouter();
  const { setUser, methods, status } = useSession();
  const landing = useAuthLanding();
  const params = useSearchParams();

  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [problem, setProblem] = useState<Problem | null>(null);
  const [busy, setBusy] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  // Guards the auto-submit: input-otp fires onComplete on every render where
  // the value is full, including after a failed attempt.
  const submittedCode = useRef<string | null>(null);

  // ?next= is where the user was headed before we asked them to sign in.
  const destination = sameOriginPath(next ?? params.get("next")) ?? "/boards";

  // Which board to claim, in order of directness: an explicit prop, the
  // ?claim= the OAuth callback appends, or — for the email flow, which gets no
  // ?claim= at all — the board we're heading back to. claimIfPossible no-ops
  // without a creator token, so guessing here is free.
  const returningToBoard = parseBoardRef(destination);
  const claimId =
    claim ?? landing.claim ?? (returningToBoard.ok ? returningToBoard.id : null);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  // An OAuth attempt that failed sends us back here with ?error=.
  const shown = problem ?? landing.error;

  async function sendCode() {
    if (busy || cooldown > 0) return;
    if (!EMAIL_RE.test(email.trim())) {
      setProblem({ message: "Enter an email address so we can send a code." });
      return;
    }

    setBusy(true);
    setProblem(null);
    try {
      await requestEmailCode(email.trim());
      setStep("code");
      setCode("");
      submittedCode.current = null;
      setCooldown(RESEND_COOLDOWN_SECONDS);
    } catch (err) {
      const problem = problemFrom(err);
      setProblem(problem);
      // A 429 tells us exactly how long to wait; honour it over our own guess.
      if (isApiError(err) && err.retryAfterSeconds) {
        setCooldown(err.retryAfterSeconds);
      }
    } finally {
      setBusy(false);
    }
  }

  async function submitCode(value: string) {
    if (busy || value.length !== CODE_LENGTH) return;
    submittedCode.current = value;

    setBusy(true);
    setProblem(null);
    try {
      const { user } = await verifyEmailCode(email.trim(), value);
      setUser(user);

      // Claiming can fail harmlessly (no token, board gone); never block the
      // sign-in on it.
      try {
        await claimIfPossible(claimId);
      } catch {
        // Ignored on purpose — the user is signed in either way.
      }

      router.replace(destination);
    } catch (err) {
      // The server's prose already distinguishes expired / exhausted /
      // mismatch, and there is no code field to branch on, so show it verbatim.
      setProblem(problemFrom(err));
      setCode("");
      submittedCode.current = null;
    } finally {
      setBusy(false);
    }
  }

  const emailUnavailable = status === "ready" && !methods.email;

  return (
    <div className="mt-6 flex flex-col gap-4">
      {emailUnavailable ? (
        <p className="rounded-md border border-border bg-canvas px-3 py-2 text-base text-ink-secondary">
          Email sign-in isn&apos;t configured on this server.
        </p>
      ) : step === "email" ? (
        <form
          onSubmit={(event: FormEvent) => {
            event.preventDefault();
            void sendCode();
          }}
          noValidate
        >
          <label htmlFor={emailId} className="text-sm font-medium text-ink">
            Email
          </label>
          <input
            id={emailId}
            type="email"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              if (problem) setProblem(null);
            }}
            placeholder="you@example.com"
            autoComplete="email"
            aria-invalid={shown ? true : undefined}
            aria-describedby={shown ? errorId : undefined}
            className={
              FIELD_BASE +
              " " +
              (shown
                ? "border-danger focus:border-danger"
                : "border-border focus:border-accent")
            }
          />
          {shown ? <Problem id={errorId} problem={shown} /> : null}
          <Button
            type="submit"
            variant="primary"
            size="md"
            className="mt-3 w-full"
            loading={busy}
          >
            Continue with email
          </Button>
        </form>
      ) : (
        <form
          onSubmit={(event: FormEvent) => {
            event.preventDefault();
            void submitCode(code);
          }}
          noValidate
        >
          <label htmlFor={codeId} className="text-sm font-medium text-ink">
            Enter the code we emailed to {email}
          </label>
          <OTPInput
            id={codeId}
            value={code}
            onChange={setCode}
            onComplete={(value) => {
              if (submittedCode.current === value) return;
              void submitCode(value);
            }}
            maxLength={CODE_LENGTH}
            pattern={REGEXP_ONLY_DIGITS}
            autoComplete="one-time-code"
            autoFocus
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
          {shown ? <Problem id={errorId} problem={shown} /> : null}
          <p id={`${codeId}-hint`} className="mt-2 text-xs text-ink-muted">
            Six digits, from the email. Didn&apos;t get it?{" "}
            <button
              type="button"
              onClick={() => void sendCode()}
              disabled={cooldown > 0 || busy}
              className="rounded-sm underline decoration-border underline-offset-4 hover:decoration-accent focus-visible:focus-ring disabled:text-ink-muted disabled:no-underline"
            >
              {/* The request endpoint returns an identical 200 whether it sent
                  or was suppressed by the cooldown, so a truthful countdown is
                  the only honest affordance here. */}
              {cooldown > 0 ? (
                <span className="tabular-nums">Resend in {cooldown}s</span>
              ) : (
                "Resend code"
              )}
            </button>
          </p>
          <Button
            type="submit"
            variant="primary"
            size="md"
            className="mt-3 w-full"
            loading={busy}
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
                setProblem(null);
                submittedCode.current = null;
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

      <OAuthButtons returnTo={destination} claim={claimId} />
    </div>
  );
}

function Problem({ id, problem }: { id: string; problem: Problem }) {
  return (
    <p id={id} role="alert" className="mt-2 text-xs text-danger">
      {problem.message}
      {problem.next ? (
        <span className="text-ink-muted"> {problem.next}</span>
      ) : null}
    </p>
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
