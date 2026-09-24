import { act, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import { createElement, removeElements } from "@/lib/board/elements";
import { CURSOR_COLORS } from "@/lib/presence-colors";
import type { PresencePeer } from "@/lib/realtime/presence";
import { PeerSelectionLayer } from "./PeerSelectionLayer";

const coral = CURSOR_COLORS.find((color) => color.name === "coral")!;

const peer = (selection: string[], name = "Bo"): PresencePeer => ({
  clientId: 7,
  name,
  color: coral,
  signedIn: false,
  avatarUrl: null,
  cursor: null,
  selection,
});

describe("PeerSelectionLayer", () => {
  it("outlines what a peer has selected, in their colour", () => {
    const doc = new Y.Doc();
    const a = createElement(doc, { kind: "rect", x: 10, y: 20, w: 100, h: 50 });
    render(<PeerSelectionLayer doc={doc} peers={[peer([a])]} />);

    const outline = screen.getByTestId("peer-selection");
    expect(outline).toHaveAttribute("data-element-id", a);
    expect(outline.style.left).toBe("10px");
    expect(outline.style.width).toBe("100px");
    expect(outline.innerHTML).toContain(coral.base);
  });

  // §1 / §12 — colour is never the only identifier.
  it("names the peer once, however much they have selected", () => {
    const doc = new Y.Doc();
    const a = createElement(doc, { kind: "rect", x: 0, y: 0, w: 10, h: 10 });
    const b = createElement(doc, { kind: "rect", x: 50, y: 0, w: 10, h: 10 });
    render(<PeerSelectionLayer doc={doc} peers={[peer([a, b])]} />);

    expect(screen.getAllByTestId("peer-selection")).toHaveLength(2);
    expect(screen.getAllByText("Bo")).toHaveLength(1);
  });

  it("draws nothing for a peer with nothing selected", () => {
    const doc = new Y.Doc();
    render(<PeerSelectionLayer doc={doc} peers={[peer([])]} />);
    expect(screen.queryByTestId("peer-selection")).toBeNull();
  });

  it("drops an outline when the element goes, and moves the name to what's left", () => {
    const doc = new Y.Doc();
    const a = createElement(doc, { kind: "rect", x: 0, y: 0, w: 10, h: 10 });
    const b = createElement(doc, { kind: "rect", x: 50, y: 0, w: 10, h: 10 });
    render(<PeerSelectionLayer doc={doc} peers={[peer([a, b])]} />);

    act(() => removeElements(doc, [a]));

    expect(screen.getAllByTestId("peer-selection")).toHaveLength(1);
    expect(screen.getByText("Bo")).toBeInTheDocument();
  });
});
