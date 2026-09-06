import Link from "next/link";
import { Wordmark } from "@/components/ui/Wordmark";
import { ThemeToggle } from "@/components/site/ThemeToggle";
import { AUTHOR, FOOTER_COLUMNS, SITE } from "@/lib/site";

const linkClass =
  "rounded-sm text-base text-ink-secondary transition-colors duration-(--dur-fast) " +
  "ease-standard hover:text-ink focus-visible:focus-ring";

export function SiteFooter() {
  return (
    <footer className="mt-24 border-t border-border lg:mt-32">
      <div className="shell py-12">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-[1.4fr_repeat(3,1fr)]">
          <div className="max-w-72">
            <Wordmark className="text-md" />
            <p className="mt-3 text-base text-ink-muted">{SITE.description}</p>
          </div>

          {FOOTER_COLUMNS.map((column) => (
            <nav key={column.heading} aria-label={column.heading}>
              <h2 className="text-sm font-medium text-ink">{column.heading}</h2>
              <ul className="mt-3 flex flex-col gap-2">
                {column.links.map((link) => (
                  <li key={link.href}>
                    {"external" in link && link.external ? (
                      <a
                        href={link.href}
                        className={linkClass}
                        target="_blank"
                        rel="noreferrer noopener"
                      >
                        {link.label}
                      </a>
                    ) : (
                      <Link href={link.href} className={linkClass}>
                        {link.label}
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>

        <div className="mt-12 flex flex-wrap items-center gap-x-6 gap-y-3 border-t border-border pt-6">
          <p className="text-sm text-ink-muted">
            Built by{" "}
            <a
              href={AUTHOR.site}
              className="rounded-sm text-ink underline decoration-border underline-offset-4 hover:decoration-accent focus-visible:focus-ring"
              target="_blank"
              rel="noreferrer noopener"
            >
              {AUTHOR.name}
            </a>
            . MIT licensed.
          </p>
          <ul className="flex items-center gap-4">
            {AUTHOR.socials.map((social) => (
              <li key={social.label}>
                <a
                  href={social.href}
                  className={linkClass + " text-sm"}
                  target="_blank"
                  rel="noreferrer noopener"
                >
                  {social.label}
                </a>
              </li>
            ))}
          </ul>
          <div className="ml-auto">
            <ThemeToggle />
          </div>
        </div>
      </div>
    </footer>
  );
}
