"use client";

// Everything on the board, in paint order.

import { useEffect, useState } from "react";
import type * as Y from "yjs";
import { repairOrder } from "@/lib/board/elements";
import { useElementIds } from "@/lib/realtime/useElements";
import { ElementView } from "./ElementView";

export function ElementLayer({
  doc,
  editingId,
  draggingIds,
  onEndEdit,
  hydrated,
}: {
  doc: Y.Doc;
  editingId: string | null;
  draggingIds: readonly string[];
  onEndEdit: () => void;
  /** The §7 settle signal from useBoardDoc. */
  hydrated: boolean;
}) {
  const ids = useElementIds(doc);

  // §7's settle is "the one orchestrated moment": the elements that were
  // already on the board when the document arrived. Capturing that batch is a
  // truer definition than a time window, and it needs no clock — anything a
  // peer draws afterwards simply appears, which is what §1 means by the settle
  // being the only animation nobody asked for.
  const [settleBatch, setSettleBatch] = useState<ReadonlySet<string> | null>(null);
  if (hydrated && settleBatch === null) setSettleBatch(new Set(ids));

  // `order` and `elements` are separate root types, so a create that raced a
  // delete can leave an element with no place in the paint order. Rendering
  // already skips those; this puts them back so they aren't invisible forever.
  useEffect(() => {
    repairOrder(doc);
  }, [doc]);

  return (
    <>
      {ids.map((id, index) => (
        <SettlingElement
          key={id}
          doc={doc}
          id={id}
          index={index}
          editing={editingId === id}
          dragging={draggingIds.includes(id)}
          onEndEdit={onEndEdit}
          settling={settleBatch?.has(id) ?? false}
        />
      ))}
    </>
  );
}

/**
 * Freezes `settling` at mount.
 *
 * The settle is a one-off on hydrate (§7, "the only orchestrated moment"), so
 * whether an element animates in is decided when it appears and never revisited
 * — otherwise a note someone creates later would inherit both the entrance and
 * a delay computed from its index.
 */
function SettlingElement({
  settling,
  ...props
}: React.ComponentProps<typeof ElementView>) {
  // Both frozen at mount: the flag decides whether this element animates at
  // all, and the index is its place in the stagger. `order` is shared and
  // mutable, so a live index would restart the entrance when a peer reorders.
  const [settleOnMount] = useState(settling);
  const [indexAtMount] = useState(props.index);
  return <ElementView {...props} index={indexAtMount} settling={settleOnMount} />;
}
