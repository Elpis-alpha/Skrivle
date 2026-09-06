import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import Page from "./page";

describe("home page", () => {
  it("renders the skrivle wordmark", () => {
    render(<Page />);
    expect(screen.getByText("skrivle")).toBeInTheDocument();
  });
});
