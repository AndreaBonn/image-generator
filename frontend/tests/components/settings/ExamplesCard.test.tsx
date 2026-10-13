import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ExamplesCard } from "@/components/settings/ExamplesCard";
import * as queries from "@/api/queries";
import { ApiError } from "@/api/errors";
import type { AssetGeneration } from "@/api/types";
import { buildExampleItem, buildExamplesResponse } from "../../fixtures/example";

function generation(overrides: Partial<AssetGeneration> = {}): AssetGeneration {
  return { kind: null, status: "idle", done: 0, total: 0, message: null, ...overrides };
}

function renderExamplesCard() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ExamplesCard />
    </QueryClientProvider>,
  );
}

describe("ExamplesCard", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  beforeEach(() => {
    vi.spyOn(queries, "fetchAssetGeneration").mockResolvedValue(generation());
  });

  it("shows how many examples are present", async () => {
    vi.spyOn(queries, "fetchExamples").mockResolvedValue(
      buildExamplesResponse({ examples: [buildExampleItem(), buildExampleItem({ id: "ex-2" })] }),
    );
    renderExamplesCard();

    expect(await screen.findByText("2 esempi presenti.")).toBeInTheDocument();
  });

  it("shows an absent state when no examples exist", async () => {
    vi.spyOn(queries, "fetchExamples").mockResolvedValue(buildExamplesResponse({ examples: [] }));
    renderExamplesCard();

    expect(await screen.findByText("Nessun esempio presente.")).toBeInTheDocument();
  });

  it("shows the copyable generation command", async () => {
    vi.spyOn(queries, "fetchExamples").mockResolvedValue(buildExamplesResponse({ examples: [] }));
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    renderExamplesCard();

    const command = "cd backend && uv run python -m app.cli.assets examples";
    expect(await screen.findByText(command)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Copia" }));
    expect(writeText).toHaveBeenCalledWith(command);
    expect(await screen.findByRole("button", { name: "Copiato" })).toBeInTheDocument();
  });

  it("starts creating the missing examples with one click (I4)", async () => {
    vi.spyOn(queries, "fetchExamples").mockResolvedValue(buildExamplesResponse({ examples: [] }));
    const start = vi
      .spyOn(queries, "startAssetGeneration")
      .mockResolvedValue(generation({ kind: "examples", status: "running" }));
    renderExamplesCard();

    await userEvent.click(await screen.findByRole("button", { name: "Crea gli esempi mancanti" }));

    expect(start).toHaveBeenCalledWith("examples");
  });

  it("starts creating the missing style previews (I4)", async () => {
    vi.spyOn(queries, "fetchExamples").mockResolvedValue(buildExamplesResponse({ examples: [] }));
    const start = vi
      .spyOn(queries, "startAssetGeneration")
      .mockResolvedValue(generation({ kind: "styles", status: "running" }));
    renderExamplesCard();

    await userEvent.click(await screen.findByRole("button", { name: "Crea le anteprime degli stili mancanti" }));

    expect(start).toHaveBeenCalledWith("styles");
  });

  it("shows progress and a cancel button while a run is going (I4)", async () => {
    vi.spyOn(queries, "fetchExamples").mockResolvedValue(buildExamplesResponse({ examples: [] }));
    vi.spyOn(queries, "fetchAssetGeneration").mockResolvedValue(
      generation({ kind: "styles", status: "running", done: 12, total: 45 }),
    );
    const cancel = vi.spyOn(queries, "cancelAssetGeneration").mockResolvedValue(generation({ status: "cancelled" }));
    renderExamplesCard();

    const bar = await screen.findByRole("progressbar", { name: "Anteprime degli stili: 12 di 45" });
    expect(bar).toHaveAttribute("value", "12");
    expect(screen.getByRole("button", { name: "Crea gli esempi mancanti" })).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: "Annulla" }));
    expect(cancel).toHaveBeenCalled();
  });

  it("says how many images a finished run created (I4)", async () => {
    vi.spyOn(queries, "fetchExamples").mockResolvedValue(buildExamplesResponse({ examples: [] }));
    vi.spyOn(queries, "fetchAssetGeneration").mockResolvedValue(
      generation({ kind: "examples", status: "completed", done: 8, total: 8 }),
    );
    renderExamplesCard();

    expect(await screen.findByText("Esempi: 8 immagini create.")).toBeInTheDocument();
  });

  it("says nothing was missing when a run had nothing to create (I4)", async () => {
    vi.spyOn(queries, "fetchExamples").mockResolvedValue(buildExamplesResponse({ examples: [] }));
    vi.spyOn(queries, "fetchAssetGeneration").mockResolvedValue(generation({ kind: "styles", status: "completed" }));
    renderExamplesCard();

    expect(await screen.findByText("Anteprime degli stili: c'era già tutto.")).toBeInTheDocument();
  });

  it("shows the engine's message when a run failed (I4)", async () => {
    vi.spyOn(queries, "fetchExamples").mockResolvedValue(buildExamplesResponse({ examples: [] }));
    vi.spyOn(queries, "fetchAssetGeneration").mockResolvedValue(
      generation({ kind: "styles", status: "failed", done: 2, total: 45, message: "Il motore non risponde." }),
    );
    renderExamplesCard();

    expect(await screen.findByText("Creazione delle anteprime degli stili interrotta: Il motore non risponde.")).toBeInTheDocument();
  });

  it("shows why a start was refused (I4)", async () => {
    vi.spyOn(queries, "fetchExamples").mockResolvedValue(buildExamplesResponse({ examples: [] }));
    vi.spyOn(queries, "startAssetGeneration").mockRejectedValue(
      new ApiError({ code: "ASSET_GENERATION_IN_PROGRESS", message: "Sta già creando.", status: 409 }),
    );
    renderExamplesCard();

    await userEvent.click(await screen.findByRole("button", { name: "Crea gli esempi mancanti" }));

    expect(await screen.findByText("Sta già creando.")).toBeInTheDocument();
  });

  it("reloads the examples once a run finishes, so new ones appear without a refresh (I4)", async () => {
    const fetchExamples = vi
      .spyOn(queries, "fetchExamples")
      .mockResolvedValue(buildExamplesResponse({ examples: [] }));
    vi.spyOn(queries, "fetchAssetGeneration")
      .mockResolvedValueOnce(generation({ kind: "examples", status: "running", done: 1, total: 8 }))
      .mockResolvedValue(generation({ kind: "examples", status: "completed", done: 8, total: 8 }));
    renderExamplesCard();

    expect(await screen.findByText("Esempi: 8 immagini create.", undefined, { timeout: 3000 })).toBeInTheDocument();
    await waitFor(() => expect(fetchExamples).toHaveBeenCalledTimes(2));
  });

  it("does not count kept images when a run is cancelled before the first one (I4)", async () => {
    vi.spyOn(queries, "fetchExamples").mockResolvedValue(buildExamplesResponse({ examples: [] }));
    vi.spyOn(queries, "fetchAssetGeneration").mockResolvedValue(
      generation({ kind: "examples", status: "cancelled", done: 0, total: 8 }),
    );
    renderExamplesCard();

    expect(await screen.findByText("Creazione degli esempi annullata.")).toBeInTheDocument();
  });

  it("keeps the images already made when a run is cancelled midway (I4)", async () => {
    vi.spyOn(queries, "fetchExamples").mockResolvedValue(buildExamplesResponse({ examples: [] }));
    vi.spyOn(queries, "fetchAssetGeneration").mockResolvedValue(
      generation({ kind: "styles", status: "cancelled", done: 3, total: 45 }),
    );
    renderExamplesCard();

    expect(
      await screen.findByText("Creazione delle anteprime degli stili annullata: le 3 immagini già pronte restano."),
    ).toBeInTheDocument();
  });

  it("shows an indeterminate bar until the run knows how many images it will make (I4)", async () => {
    vi.spyOn(queries, "fetchExamples").mockResolvedValue(buildExamplesResponse({ examples: [] }));
    vi.spyOn(queries, "fetchAssetGeneration").mockResolvedValue(generation({ kind: "styles", status: "running" }));
    renderExamplesCard();

    const bar = await screen.findByRole("progressbar", { name: "Anteprime degli stili: preparazione..." });
    expect(bar).not.toHaveAttribute("value");
  });
});
