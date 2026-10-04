import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { LoadedModelCard } from "@/components/settings/LoadedModelCard";

describe("LoadedModelCard", () => {
  it("shows 'Nessuno' when no model family is loaded", () => {
    render(<LoadedModelCard family={null} />);

    expect(screen.getByText("Nessuno")).toBeInTheDocument();
  });

  it("translates a known family to its Italian label", () => {
    render(<LoadedModelCard family="sdxl" />);

    expect(screen.getByText("SDXL (Juggernaut)")).toBeInTheDocument();
  });

  it("falls back to the raw family name when it has no known label", () => {
    render(<LoadedModelCard family="some-future-model" />);

    expect(screen.getByText("some-future-model")).toBeInTheDocument();
  });

  it("offers an InfoTip explaining the loaded model (A9)", () => {
    render(<LoadedModelCard family={null} />);

    expect(screen.getByRole("button", { name: "Informazioni: Modello in memoria" })).toBeInTheDocument();
  });
});
