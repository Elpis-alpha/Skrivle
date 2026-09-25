"use client";

// STYLE_GUIDE.md §10.15 — a My Boards tile's overflow menu (⋯): Rename,
// Duplicate, Delete. Styled and driven as §10.18's dropdown: arrow keys, Home
// and End move through it, Esc closes it and hands focus back.
//
// Only the owner sees Rename and Delete; the API refuses both from anyone
// else, so offering them would only lead to an error.

import { Ellipsis } from "lucide-react";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Tooltip } from "@/components/ui/Tooltip";

type Item = { label: string; run: () => void; danger?: boolean };

const ITEM =
  "block w-full rounded-sm px-2.5 py-2 text-left text-base focus-visible:focus-ring ";

export function TileMenu({
  title,
  owner,
  onRename,
  onDuplicate,
  onDelete,
}: {
  /** The board's, so each tile's button has a name of its own. */
  title: string;
  owner: boolean;
  onRename: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const items: Item[] = owner
    ? [
        { label: "Rename", run: onRename },
        { label: "Duplicate", run: onDuplicate },
        { label: "Delete", run: onDelete, danger: true },
      ]
    : [{ label: "Duplicate", run: onDuplicate }];

  const close = useCallback((refocus: boolean) => {
    setOpen(false);
    if (refocus) triggerRef.current?.focus();
  }, []);

  // Into the menu as it opens, so the arrow keys work straight away.
  useEffect(() => {
    if (open) menuItems(menuRef.current)[0]?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (menuRef.current?.contains(target) || triggerRef.current?.contains(target)) return;
      close(false);
    };
    window.addEventListener("mousedown", onPointerDown);
    return () => window.removeEventListener("mousedown", onPointerDown);
  }, [open, close]);

  const onKeyDown = (event: React.KeyboardEvent) => {
    const all = menuItems(menuRef.current);
    const at = all.indexOf(document.activeElement as HTMLElement);
    const focus = (index: number) => all[(index + all.length) % all.length]?.focus();

    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        return focus(at + 1);
      case "ArrowUp":
        event.preventDefault();
        return focus(at - 1);
      case "Home":
        event.preventDefault();
        return focus(0);
      case "End":
        event.preventDefault();
        return focus(all.length - 1);
      case "Escape":
        event.preventDefault();
        return close(true);
      // Tab carries on to the next thing on the page; the menu just gets out
      // of the way.
      case "Tab":
        return close(false);
    }
  };

  return (
    <div className="relative">
      <Tooltip label="More">
        <button
          ref={triggerRef}
          type="button"
          onClick={() => setOpen((wasOpen) => !wasOpen)}
          aria-haspopup="menu"
          aria-expanded={open}
          aria-controls={open ? menuId : undefined}
          aria-label={`More for ${title}`}
          className={
            "grid size-8 place-items-center rounded-sm text-ink-secondary transition-colors " +
            "duration-(--dur-fast) ease-standard hover:bg-wg-50 hover:text-ink focus-visible:focus-ring"
          }
        >
          <Ellipsis size={20} strokeWidth={1.5} aria-hidden />
        </button>
      </Tooltip>

      {open ? (
        <div
          ref={menuRef}
          id={menuId}
          role="menu"
          aria-label={`More for ${title}`}
          onKeyDown={onKeyDown}
          className="absolute right-0 top-full z-20 mt-1 w-44 rounded-md border border-border bg-surface p-1 shadow-elev-2"
        >
          {items.map((item) => (
            <div key={item.label}>
              {/* §10.18 — the destructive item sits apart. */}
              {item.danger ? <div role="separator" className="my-1 h-px bg-wg-100" /> : null}
              <button
                type="button"
                role="menuitem"
                // Roving focus: the arrow keys move it, and Tab leaves.
                tabIndex={-1}
                // Focus back on the button first, so a dialog the item opens
                // hands it back there when it closes.
                onClick={() => {
                  close(true);
                  item.run();
                }}
                className={
                  ITEM +
                  (item.danger ? "text-danger hover:bg-danger-subtle" : "text-ink hover:bg-wg-50")
                }
              >
                {item.label}
              </button>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function menuItems(menu: HTMLElement | null): HTMLElement[] {
  return menu ? [...menu.querySelectorAll<HTMLElement>('[role="menuitem"]')] : [];
}
