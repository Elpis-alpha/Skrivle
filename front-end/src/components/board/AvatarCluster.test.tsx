import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { Role } from "@/lib/api/types";
import { CURSOR_COLORS } from "@/lib/presence-colors";
import type { Self } from "@/lib/realtime/board-session";
import type { PresencePeer } from "@/lib/realtime/presence";
import { AvatarCluster } from "./AvatarCluster";

const self: Self = { userId: "u1", name: "Ada", signedIn: true, color: CURSOR_COLORS[0] };

const peer = (clientId: number, name: string, role: Role | null): PresencePeer => ({
  clientId,
  name,
  color: CURSOR_COLORS[clientId % CURSOR_COLORS.length],
  signedIn: false,
  avatarUrl: null,
  cursor: null,
  selection: [],
  role,
});

const cluster = () => screen.getByRole("button", { name: /On this board/ });
const list = () => screen.getByRole("list", { name: "On this board" });
const rows = () => within(list()).getAllByRole("listitem");

/** Each row reads as this, in this order. Rows also hold a disc's initial. */
const expectRows = (...labels: string[]) => {
  expect(rows()).toHaveLength(labels.length);
  labels.forEach((label, i) => expect(rows()[i]).toHaveTextContent(label));
};

describe("AvatarCluster", () => {
  // §10.11 — "Click the cluster → a list popover ('Maya · editor', 'You · owner')."
  it("lists everyone on the board, with their role, when pressed", () => {
    render(<AvatarCluster self={self} role="owner" peers={[peer(1, "Maya", "editor")]} />);
    expect(screen.queryByRole("list")).toBeNull();

    fireEvent.click(cluster());

    expectRows("You · owner", "Maya · editor");
    expect(cluster()).toHaveAttribute("aria-expanded", "true");
  });

  // Anyone with the link can edit, so no role on record means editor.
  it("lists anyone without a role as an editor", () => {
    render(<AvatarCluster self={self} role={null} peers={[peer(1, "Bo", null)]} />);
    fireEvent.click(cluster());
    expectRows("You · editor", "Bo · editor");
  });

  // The discs stop at four; the list is where the rest can be seen.
  it("lists the people the +N chip stands for", () => {
    const peers = ["Bo", "Cy", "Di", "Ed", "Flo", "Gus"].map((name, i) => peer(i + 1, name, null));
    render(<AvatarCluster self={self} role={null} peers={peers} />);

    expect(screen.getByText("+2")).toBeInTheDocument();
    fireEvent.click(cluster());
    expect(rows()).toHaveLength(7);
  });

  it("closes on Escape, handing focus back to the cluster", () => {
    render(<AvatarCluster self={self} role="owner" peers={[]} />);
    fireEvent.click(cluster());

    fireEvent.keyDown(window, { key: "Escape" });

    expect(screen.queryByRole("list")).toBeNull();
    expect(cluster()).toHaveFocus();
  });

  it("closes on a press anywhere else", () => {
    render(<AvatarCluster self={self} role="owner" peers={[]} />);
    fireEvent.click(cluster());

    fireEvent.mouseDown(document.body);

    expect(screen.queryByRole("list")).toBeNull();
  });

  it("closes when pressed again", () => {
    render(<AvatarCluster self={self} role="owner" peers={[]} />);
    fireEvent.click(cluster());
    fireEvent.click(cluster());
    expect(screen.queryByRole("list")).toBeNull();
  });
});
