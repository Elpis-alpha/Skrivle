// STYLE_GUIDE.md §10.1 — four variants, three sizes, five states.
// Renders as <button> or, when given `href`, as a link that looks identical.

import Link from "next/link";
import type { ComponentPropsWithoutRef, ReactNode } from "react";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

const BASE =
  "relative inline-flex items-center justify-center gap-2 rounded-md font-medium " +
  "whitespace-nowrap transition-colors duration-(--dur-fast) ease-standard " +
  "focus-visible:focus-ring disabled:cursor-not-allowed";

const VARIANTS: Record<ButtonVariant, string> = {
  primary:
    "bg-accent text-accent-on hover:bg-accent-hover active:bg-accent-active " +
    "disabled:bg-accent-200 disabled:text-accent-on",
  secondary:
    "bg-surface text-ink border border-border hover:bg-wg-50 active:bg-wg-100 " +
    "disabled:text-wg-400 disabled:hover:bg-surface",
  ghost:
    "text-ink hover:bg-wg-50 active:bg-wg-100 " +
    "disabled:text-wg-400 disabled:hover:bg-transparent",
  danger:
    "bg-danger text-white hover:brightness-95 active:brightness-90 " +
    "disabled:bg-wg-300",
};

// 44px minimum touch target on coarse pointers (§1 quality floor).
const SIZES: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-sm pointer-coarse:h-11",
  md: "h-10 px-4 text-base pointer-coarse:h-11",
  lg: "h-12 px-5 text-md",
};

function classesFor(variant: ButtonVariant, size: ButtonSize, className: string) {
  return `${BASE} ${VARIANTS[variant]} ${SIZES[size]} ${className}`;
}

function Spinner() {
  return (
    <svg
      className="size-4 animate-spin"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <circle
        cx="8"
        cy="8"
        r="6.5"
        stroke="currentColor"
        strokeWidth="1.5"
        opacity="0.25"
      />
      <path
        d="M14.5 8A6.5 6.5 0 0 0 8 1.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

type Styling = {
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
  children: ReactNode;
};

type ButtonProps = Styling &
  Omit<ComponentPropsWithoutRef<"button">, "className" | "children"> & {
    /** Swaps the label for a spinner and holds the button's width. */
    loading?: boolean;
  };

type LinkProps = Styling &
  Omit<ComponentPropsWithoutRef<typeof Link>, "className" | "children" | "href"> & {
    href: string;
  };

/** `href` is the discriminant: with it you get a link, without it a button. */
export function Button(props: ButtonProps | LinkProps) {
  return "href" in props ? <LinkButton {...props} /> : <PlainButton {...props} />;
}

function LinkButton({
  variant = "secondary",
  size = "md",
  className = "",
  children,
  href,
  ...rest
}: LinkProps) {
  const classes = classesFor(variant, size, className);

  if (/^https?:\/\//.test(href)) {
    return (
      <a
        {...(rest as ComponentPropsWithoutRef<"a">)}
        href={href}
        className={classes}
        target="_blank"
        rel="noreferrer noopener"
      >
        {children}
      </a>
    );
  }

  return (
    <Link {...rest} href={href} className={classes}>
      {children}
    </Link>
  );
}

function PlainButton({
  variant = "secondary",
  size = "md",
  className = "",
  children,
  loading = false,
  disabled,
  type = "button",
  ...rest
}: ButtonProps) {
  return (
    <button
      {...rest}
      type={type}
      className={classesFor(variant, size, className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
    >
      {/* The label stays in the layout while loading so the button keeps its
          width — a CTA that shrinks under the cursor is its own small bug. */}
      <span className={loading ? "invisible inline-flex items-center gap-2" : "contents"}>
        {children}
      </span>
      {loading ? (
        <span className="absolute inset-0 flex items-center justify-center">
          <Spinner />
        </span>
      ) : null}
    </button>
  );
}
