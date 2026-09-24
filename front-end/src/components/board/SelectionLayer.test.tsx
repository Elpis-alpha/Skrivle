import { act, render } from "@testing-library/react";
import { createRef } from "react";
import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import { createElement } from "@/lib/board/elements";
import { createPreviewStore } from "@/lib/board/preview";
import { SelectionLayer } from "./SelectionLayer";

describe("SelectionLayer", () => {
  it("outlines the box a gesture is previewing, not the document's older one", () => {
    const doc = new Y.Doc();
    const preview = createPreviewStore();
    const id = createElement(doc, { kind: "rect", x: 0, y: 0, w: 100, h: 50 });
    const { getByTestId } = render(
      <SelectionLayer doc={doc} ids={[id]} marqueeRef={createRef()} preview={preview} />,
    );

    act(() => preview.set(id, { x: 0, y: 0, w: 300, h: 200 }));

    const style = getByTestId("board-selection").style;
    expect([style.width, style.height]).toEqual(["300px", "200px"]);
  });
});
