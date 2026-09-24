import { act, render } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import * as Y from "yjs";
import { appendPoints, createElement } from "@/lib/board/elements";
import { createPreviewStore, type PreviewStore } from "@/lib/board/preview";
import { strokeOutline } from "@/lib/board/stroke";
import { ElementView } from "./ElementView";

let doc: Y.Doc;
let preview: PreviewStore;
beforeEach(() => {
  doc = new Y.Doc();
  preview = createPreviewStore();
});

const renderElement = (id: string) =>
  render(
    <ElementView
      doc={doc}
      id={id}
      index={0}
      editing={false}
      dragging={false}
      onEndEdit={() => {}}
      settling={false}
      preview={preview}
    />,
  );

const wrapper = (container: HTMLElement) =>
  container.querySelector<HTMLElement>("[data-testid='board-element']")!;

describe("ElementView", () => {
  it("draws the gesture's preview box in place of the document's", () => {
    const id = createElement(doc, { kind: "rect", x: 0, y: 0, w: 100, h: 50 });
    const { container } = renderElement(id);

    act(() => preview.set(id, { x: 10, y: 20, w: 300, h: 200 }));

    const style = wrapper(container).style;
    expect([style.left, style.top, style.width, style.height]).toEqual([
      "10px",
      "20px",
      "300px",
      "200px",
    ]);
  });

  it("goes back to the document's box once the preview clears", () => {
    const id = createElement(doc, { kind: "rect", x: 0, y: 0, w: 100, h: 50 });
    const { container } = renderElement(id);

    act(() => preview.set(id, { x: 10, y: 20, w: 300, h: 200 }));
    act(() => preview.clear(id));

    expect(wrapper(container).style.width).toBe("100px");
  });

  it("resolves a previewed line's delta into a box, like the document's", () => {
    const id = createElement(doc, { kind: "line", x: 50, y: 50, w: 10, h: 10 });
    const { container } = renderElement(id);

    act(() => preview.set(id, { x: 50, y: 50, w: -30, h: -40 }));

    const style = wrapper(container).style;
    expect([style.left, style.top, style.width, style.height]).toEqual([
      "20px",
      "10px",
      "30px",
      "40px",
    ]);
  });

  it("puts a previewed stroke's box where the gesture says, stretching its samples to fit", () => {
    // Drawn up and to the left, so the box starts before the anchor.
    const id = createElement(doc, { kind: "path", x: 100, y: 100, w: 0, h: 0, points: [0, 0] });
    act(() => appendPoints(doc, id, [-40, -20]));
    const { container } = renderElement(id);

    act(() => preview.set(id, { x: 60, y: 80, w: 80, h: 20 }));

    const style = wrapper(container).style;
    expect([style.left, style.top, style.width, style.height]).toEqual([
      "60px",
      "80px",
      "80px",
      "20px",
    ]);
    expect(container.querySelector("g")?.getAttribute("transform")).toBe(
      "translate(80, 20) scale(2, 1)",
    );
  });

  it("fills a stroke's tapered outline rather than stroking its centre line", () => {
    const id = createElement(doc, {
      kind: "path",
      x: 0,
      y: 0,
      w: 0,
      h: 0,
      strokeWidth: 4,
      points: [0, 0],
    });
    act(() => appendPoints(doc, id, [20, 10, 40, 0]));
    const { container } = renderElement(id);

    const path = container.querySelector("path")!;
    expect(path.getAttribute("d")).toBe(strokeOutline([0, 0, 20, 10, 40, 0], 4));
    expect(path.getAttribute("stroke")).toBe("none");
    expect(path.getAttribute("fill")).toBe("var(--ink)");
  });

  // content-visibility implies paint containment, which clips to the box: the
  // outer half of every outline, arrowheads at the box edge, and the tip of a
  // stroke still being drawn past the box the document knows about.
  it("never clips what it draws to its own box", () => {
    const id = createElement(doc, { kind: "rect", x: 0, y: 0, w: 100, h: 50 });
    const { container } = renderElement(id);

    const style = wrapper(container).style;
    expect(style.getPropertyValue("content-visibility")).toBe("");
    expect(style.contain ?? "").not.toMatch(/paint|strict|content/);
  });
});
