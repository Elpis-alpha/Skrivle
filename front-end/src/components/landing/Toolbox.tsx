// The real §10.5 toolbar and the real §2.5 note palette, shown as themselves.
// Cheaper than drawing a picture of the product, and it can't drift out of date
// — this is the same component the board renders, in its read-only mode.

import { Toolbar } from "@/components/board/Toolbar";
import { Reveal } from "@/components/motion/Reveal";
import { NOTE_COLORS } from "@/lib/presence-colors";

export function Toolbox() {
  return (
    <section className="shell">
      <Reveal className="rounded-lg border border-border bg-surface px-6 py-10 sm:px-10">
        <h2 className="text-lg text-ink">Eight tools, one row</h2>
        <p className="mt-3 max-w-measure text-base text-ink-secondary">
          The whole toolset sits in one pill at the bottom of the canvas, each
          tool on a single key. This is the real thing, drawn from the same
          design system as the board it belongs to.
        </p>

        {/* No stagger on the swatches below: seven chips fading up one by one
            is exactly the template pattern §13.2 rules out. */}
        <div className="mt-8 rounded-lg bg-wg-50 p-8 sm:w-fit">
          <Toolbar value="note" readOnly />
        </div>

        <h3 className="mt-10 text-base font-medium text-ink">Seven note colours</h3>
        <ul className="mt-3 flex flex-wrap gap-2">
          {NOTE_COLORS.map((color) => (
            <li
              key={color.name}
              className="size-8 rounded-note border border-black/8"
              style={{ backgroundColor: `light-dark(${color.light}, ${color.dark})` }}
            >
              <span className="sr-only">{color.name}</span>
            </li>
          ))}
        </ul>
      </Reveal>
    </section>
  );
}
