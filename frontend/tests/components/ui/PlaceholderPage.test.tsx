import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { PlaceholderPage } from "@/components/ui/PlaceholderPage";

describe("PlaceholderPage", () => {
  it("shows the given title as a heading and an honest 'in arrivo' notice", () => {
    render(<PlaceholderPage title="Upscale" />);

    expect(screen.getByRole("heading", { name: "Upscale" })).toBeInTheDocument();
    expect(screen.getByText("In arrivo.")).toBeInTheDocument();
  });

  it("renders a different title verbatim", () => {
    render(<PlaceholderPage title="Varianti" />);

    expect(screen.getByRole("heading", { name: "Varianti" })).toBeInTheDocument();
  });
});
