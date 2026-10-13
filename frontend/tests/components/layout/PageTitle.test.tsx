import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { PageTitle } from "@/components/layout/PageTitle";

describe("PageTitle", () => {
  it("keeps a level-1 heading for screen readers", () => {
    render(<PageTitle>Modifica</PageTitle>);

    expect(screen.getByRole("heading", { level: 1, name: "Modifica" })).toBeInTheDocument();
  });

  it("hides the heading visually, since the active tab already names the page", () => {
    render(<PageTitle>Modifica</PageTitle>);

    expect(screen.getByRole("heading", { level: 1 })).toHaveClass("sr-only");
  });
});
