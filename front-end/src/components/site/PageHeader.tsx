import type { ReactNode } from "react";

/** The opening block every secondary marketing page shares. */
export function PageHeader({ title, lead }: { title: string; lead?: string }) {
  return (
    <div className="relative overflow-hidden border-b border-border">
      <div className="dot-grid grid-fade absolute inset-0 -z-10" aria-hidden="true" />
      <div className="shell py-16 lg:py-20">
        <h1 className="text-2xl text-balance text-ink lg:text-3xl">{title}</h1>
        {lead ? (
          <p className="mt-4 max-w-measure text-md text-ink-secondary">{lead}</p>
        ) : null}
      </div>
    </div>
  );
}

/** Long-form body copy: 68ch measure, comfortable rhythm between blocks. */
export function Prose({ children }: { children: ReactNode }) {
  return (
    <div
      className={
        "shell py-16 " +
        "[&_h2]:mt-12 [&_h2]:text-lg [&_h2]:text-ink [&>h2:first-child]:mt-0 " +
        "[&_h3]:mt-8 [&_h3]:text-md [&_h3]:font-semibold [&_h3]:text-ink " +
        "[&_p]:mt-4 [&_p]:max-w-measure [&_p]:text-base [&_p]:text-ink-secondary " +
        "[&_ul]:mt-4 [&_ul]:flex [&_ul]:max-w-measure [&_ul]:flex-col [&_ul]:gap-2 " +
        "[&_li]:text-base [&_li]:text-ink-secondary " +
        "[&_a]:text-ink [&_a]:underline [&_a]:decoration-border [&_a]:underline-offset-4 " +
        "hover:[&_a]:decoration-accent"
      }
    >
      {children}
    </div>
  );
}
