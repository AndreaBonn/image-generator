import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { PromptGuide } from "@/components/create/PromptGuide";
import * as queries from "@/api/queries";

const basePromptLanguage = {
  required: "en" as const,
  label: "Scrivi in inglese",
  reason: "Questo modello capisce bene solo l'inglese.",
};

describe("PromptGuide language warning", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  it("shows the warning when the backend reports looks_italian: true", async () => {
    vi.spyOn(queries, "checkPromptLanguage").mockResolvedValue({ looks_italian: true });

    render(
      <PromptGuide
        promptLanguage={basePromptLanguage}
        tips={[]}
        examples={[]}
        prompt="un ritratto di un vecchio pescatore con la luce dorata"
        onUseExample={vi.fn()}
      />,
    );

    await vi.advanceTimersByTimeAsync(400);
    await waitFor(() =>
      expect(screen.getByText(/Sembra italiano/)).toBeInTheDocument(),
    );
  });

  it("does not show the warning when the backend reports looks_italian: false", async () => {
    vi.spyOn(queries, "checkPromptLanguage").mockResolvedValue({ looks_italian: false });

    render(
      <PromptGuide
        promptLanguage={basePromptLanguage}
        tips={[]}
        examples={[]}
        prompt="portrait of an old fisherman, golden hour"
        onUseExample={vi.fn()}
      />,
    );

    await vi.advanceTimersByTimeAsync(400);
    await waitFor(() => {
      expect(queries.checkPromptLanguage).toHaveBeenCalled();
    });
    expect(screen.queryByText(/Sembra italiano/)).not.toBeInTheDocument();
  });

  it("never calls the language check when required is not 'en'", async () => {
    const spy = vi.spyOn(queries, "checkPromptLanguage").mockResolvedValue({ looks_italian: true });

    render(
      <PromptGuide
        promptLanguage={{ ...basePromptLanguage, required: "any" }}
        tips={[]}
        examples={[]}
        prompt="un ritratto di un vecchio pescatore"
        onUseExample={vi.fn()}
      />,
    );

    await vi.advanceTimersByTimeAsync(400);
    expect(spy).not.toHaveBeenCalled();
    expect(screen.queryByText(/Sembra italiano/)).not.toBeInTheDocument();
  });
});
