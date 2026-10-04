import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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

  it("does not show the warning when the language check rejects", async () => {
    vi.spyOn(queries, "checkPromptLanguage").mockRejectedValue(new Error("network down"));

    render(
      <PromptGuide
        promptLanguage={basePromptLanguage}
        tips={[]}
        examples={[]}
        prompt="un ritratto di un vecchio pescatore"
        onUseExample={vi.fn()}
      />,
    );

    await vi.advanceTimersByTimeAsync(400);
    await waitFor(() => {
      expect(queries.checkPromptLanguage).toHaveBeenCalled();
    });
    expect(screen.queryByText(/Sembra italiano/)).not.toBeInTheDocument();
  });

  it("ignores a stale language-check response that resolves after the prompt has already changed", async () => {
    let resolveFirst!: (value: { looks_italian: boolean }) => void;
    const firstCheck = new Promise<{ looks_italian: boolean }>((resolve) => {
      resolveFirst = resolve;
    });
    const spy = vi
      .spyOn(queries, "checkPromptLanguage")
      .mockReturnValueOnce(firstCheck)
      .mockResolvedValueOnce({ looks_italian: false });

    const { rerender } = render(
      <PromptGuide
        promptLanguage={basePromptLanguage}
        tips={[]}
        examples={[]}
        prompt="un ritratto di un vecchio pescatore"
        onUseExample={vi.fn()}
      />,
    );
    await vi.advanceTimersByTimeAsync(400);
    await waitFor(() => expect(spy).toHaveBeenCalledTimes(1));

    // Prompt changes before the first (stale) check resolves: the effect cleanup
    // must mark it cancelled so its eventual "true" is ignored (PromptGuide.tsx:44).
    rerender(
      <PromptGuide
        promptLanguage={basePromptLanguage}
        tips={[]}
        examples={[]}
        prompt="una scena di montagna con neve"
        onUseExample={vi.fn()}
      />,
    );
    await vi.advanceTimersByTimeAsync(400);
    await waitFor(() => expect(spy).toHaveBeenCalledTimes(2));

    await act(async () => {
      resolveFirst({ looks_italian: true });
      await firstCheck;
    });

    expect(screen.queryByText(/Sembra italiano/)).not.toBeInTheDocument();
  });

  it("keeps the current warning when a stale language check rejects after the prompt changed", async () => {
    let rejectFirst!: (reason: Error) => void;
    const firstCheck = new Promise<{ looks_italian: boolean }>((_, reject) => {
      rejectFirst = reject;
    });
    const spy = vi
      .spyOn(queries, "checkPromptLanguage")
      .mockReturnValueOnce(firstCheck)
      .mockResolvedValueOnce({ looks_italian: true });

    const { rerender } = render(
      <PromptGuide
        promptLanguage={basePromptLanguage}
        tips={[]}
        examples={[]}
        prompt="a portrait of an old fisherman"
        onUseExample={vi.fn()}
      />,
    );
    await vi.advanceTimersByTimeAsync(400);
    await waitFor(() => expect(spy).toHaveBeenCalledTimes(1));

    rerender(
      <PromptGuide
        promptLanguage={basePromptLanguage}
        tips={[]}
        examples={[]}
        prompt="una scena di montagna con neve"
        onUseExample={vi.fn()}
      />,
    );
    await vi.advanceTimersByTimeAsync(400);
    await waitFor(() => expect(screen.getByText(/Sembra italiano/)).toBeInTheDocument());

    await act(async () => {
      rejectFirst(new Error("network down"));
      await firstCheck.catch(() => undefined);
    });

    expect(screen.getByText(/Sembra italiano/)).toBeInTheDocument();
  });
});

describe("PromptGuide tips panel", () => {
  it("hides the tips list and toggle when the task has no tips", () => {
    render(
      <PromptGuide
        promptLanguage={basePromptLanguage}
        tips={[]}
        examples={[]}
        prompt=""
        onUseExample={vi.fn()}
      />,
    );

    expect(screen.queryByRole("button", { name: /consigli/ })).not.toBeInTheDocument();
  });

  it("is collapsed by default and expands the tips list on click", async () => {
    render(
      <PromptGuide
        promptLanguage={basePromptLanguage}
        tips={["Descrivi soggetto, ambiente, luce e stile, in quest'ordine."]}
        examples={[]}
        prompt=""
        onUseExample={vi.fn()}
      />,
    );

    const toggle = screen.getByRole("button", { name: "Mostra consigli" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(
      screen.queryByText("Descrivi soggetto, ambiente, luce e stile, in quest'ordine."),
    ).not.toBeInTheDocument();

    await userEvent.click(toggle);

    expect(screen.getByRole("button", { name: "Nascondi consigli" })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    expect(
      screen.getByText("Descrivi soggetto, ambiente, luce e stile, in quest'ordine."),
    ).toBeInTheDocument();
  });

  it("collapses the tips list again on a second click", async () => {
    render(
      <PromptGuide
        promptLanguage={basePromptLanguage}
        tips={["Frasi brevi separate da virgole funzionano meglio di un paragrafo."]}
        examples={[]}
        prompt=""
        onUseExample={vi.fn()}
      />,
    );

    const toggle = screen.getByRole("button", { name: "Mostra consigli" });
    await userEvent.click(toggle);
    await userEvent.click(screen.getByRole("button", { name: "Nascondi consigli" }));

    expect(screen.getByRole("button", { name: "Mostra consigli" })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
    expect(
      screen.queryByText("Frasi brevi separate da virgole funzionano meglio di un paragrafo."),
    ).not.toBeInTheDocument();
  });

  it("renders every tip as a list item when expanded", async () => {
    render(
      <PromptGuide
        promptLanguage={basePromptLanguage}
        tips={["Primo consiglio.", "Secondo consiglio."]}
        examples={[]}
        prompt=""
        onUseExample={vi.fn()}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: "Mostra consigli" }));

    expect(screen.getByText("Primo consiglio.")).toBeInTheDocument();
    expect(screen.getByText("Secondo consiglio.")).toBeInTheDocument();
  });
});

describe("PromptGuide examples", () => {
  it("hides the examples section when the task has none", () => {
    render(
      <PromptGuide
        promptLanguage={basePromptLanguage}
        tips={[]}
        examples={[]}
        prompt=""
        onUseExample={vi.fn()}
      />,
    );

    expect(screen.queryByText("Esempi (clicca per usarli)")).not.toBeInTheDocument();
  });

  it("calls onUseExample with the example text when an example is clicked", async () => {
    const onUseExample = vi.fn();
    const example = "portrait of an old fisherman, golden hour";
    render(
      <PromptGuide
        promptLanguage={basePromptLanguage}
        tips={[]}
        examples={[example]}
        prompt=""
        onUseExample={onUseExample}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: example }));
    expect(onUseExample).toHaveBeenCalledWith(example);
  });
});
