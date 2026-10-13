import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { ResultArea } from "@/components/create/ResultArea";
import * as queries from "@/api/queries";
import type { JobEvent } from "@/api/types";

function renderResultArea(overrides: Partial<Parameters<typeof ResultArea>[0]> = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const onRetry = vi.fn();
  const onCancel = vi.fn();
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <ResultArea
          latestEvent={null}
          generationIds={[]}
          errorMessage={null}
          onRetry={onRetry}
          onCancel={onCancel}
          isRunning={false}
          {...overrides}
        />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return { onRetry, onCancel };
}

describe("ResultArea empty/error/running states (SPEC.md § 11.2-11.3)", () => {
  it("fills its column instead of shrinking to its content (C1)", () => {
    renderResultArea();

    // self-start keeps it sticky inside a grid row, but in a flex column it also
    // shrank the area to its content (~280 px): an explicit full width undoes that.
    const area = screen.getByText("Le immagini generate appariranno qui.").closest("[aria-live]");
    expect(area).toHaveClass("w-full", "lg:sticky", "lg:self-start");
  });

  it("shows the empty placeholder when idle with no results", () => {
    renderResultArea();
    expect(screen.getByText("Le immagini generate appariranno qui.")).toBeInTheDocument();
  });

  it("hides the empty placeholder when the page already renders external results", () => {
    renderResultArea({ hasExternalResults: true });
    expect(screen.queryByText("Le immagini generate appariranno qui.")).not.toBeInTheDocument();
  });

  it("shows the error message and a retry button that calls onRetry", async () => {
    const { onRetry } = renderResultArea({ errorMessage: "Il motore non risponde." });

    expect(screen.getByText("Il motore non risponde.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Riprova" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("shows a cancel button while running that calls onCancel", async () => {
    const { onCancel } = renderResultArea({ isRunning: true });

    await userEvent.click(screen.getByRole("button", { name: "Annulla" }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("shows progress as a bar with a percentage instead of model steps (C15)", () => {
    renderResultArea({ isRunning: true, latestEvent: { type: "progress", step: 3, total: 4 } });

    const bar = screen.getByRole("progressbar", { name: "Avanzamento" });
    expect(bar).toHaveAttribute("aria-valuenow", "75");
    expect(screen.getByText("75%")).toBeInTheDocument();
    expect(screen.queryByText(/Passo/)).not.toBeInTheDocument();
  });

  it("explains that a model change only costs time the first time (C15)", () => {
    renderResultArea({ isRunning: true, latestEvent: { type: "model_switch", family: "sdxl", eta_s: 12 } });

    expect(screen.getByText("Succede solo quando passi a un lavoro di tipo diverso.")).toBeInTheDocument();
  });

  it("shows a generic queue message when running with no event yet", () => {
    renderResultArea({ isRunning: true, latestEvent: null });
    expect(screen.getByText("In coda...")).toBeInTheDocument();
  });

  it.each<[JobEvent, string]>([
    [{ type: "queued", position: 3 }, "In coda, posizione 3."],
    [{ type: "model_switch", family: "sdxl", eta_s: 12 }, "Preparo il modello, circa 12 secondi."],
    [{ type: "progress", step: 5, total: 30 }, "17%"],
    [{ type: "completed", generation_ids: ["gen-1"] }, "In corso..."],
    [{ type: "cancelled" }, "In corso..."],
  ])("renders the right progress message for %o", (event, expectedText) => {
    renderResultArea({ isRunning: true, latestEvent: event });
    expect(screen.getByText(expectedText)).toBeInTheDocument();
  });
});

// jsdom never loads image resources, so Image.onload would not fire on its own.
class LoadingImage {
  onload: (() => void) | null = null;
  set src(_value: string) {
    queueMicrotask(() => this.onload?.());
  }
}

describe("ResultArea live preview (A2)", () => {
  beforeEach(() => {
    vi.stubGlobal("Image", LoadingImage);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("falls back to the normal progress message when no preview has arrived", () => {
    renderResultArea({ isRunning: true, latestEvent: { type: "progress", step: 2, total: 10 } });

    expect(screen.getByText("20%")).toBeInTheDocument();
    expect(screen.queryByAltText("Anteprima in corso")).not.toBeInTheDocument();
  });

  it("shows the preview image with its label once it has loaded, alongside the step counter", async () => {
    renderResultArea({
      isRunning: true,
      latestEvent: { type: "progress", step: 3, total: 10 },
      previewUrl: "/api/v1/jobs/job-1/preview?n=1",
    });

    const preview = await screen.findByAltText("Anteprima in corso");
    expect(preview).toHaveAttribute("src", "/api/v1/jobs/job-1/preview?n=1");
    expect(screen.getByText("Anteprima in corso")).toBeInTheDocument();
    expect(screen.getByText("30%")).toBeInTheDocument();
  });

  it("hides the preview image once the job stops running", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const props = (overrides: Partial<Parameters<typeof ResultArea>[0]>) => (
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <ResultArea
            latestEvent={null}
            generationIds={[]}
            errorMessage={null}
            onRetry={vi.fn()}
            onCancel={vi.fn()}
            isRunning
            {...overrides}
          />
        </MemoryRouter>
      </QueryClientProvider>
    );
    const { rerender } = render(props({ previewUrl: "/api/v1/jobs/job-1/preview?n=1" }));
    await screen.findByAltText("Anteprima in corso");

    rerender(props({ isRunning: false, previewUrl: null, generationIds: ["gen-1"] }));

    expect(screen.queryByAltText("Anteprima in corso")).not.toBeInTheDocument();
  });
});

describe("ResultArea slow job notice (SPEC.md § 11.3: over 60s)", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("does not show the slow-job notice before 60s", async () => {
    renderResultArea({ isRunning: true });
    await vi.advanceTimersByTimeAsync(59_000);
    expect(screen.queryByText("Ci sta mettendo più del previsto.")).not.toBeInTheDocument();
  });

  it("shows the slow-job notice once the job runs 60s without finishing", async () => {
    renderResultArea({ isRunning: true });
    await vi.advanceTimersByTimeAsync(60_000);
    await waitFor(() =>
      expect(screen.getByText("Ci sta mettendo più del previsto.")).toBeInTheDocument(),
    );
  });
});

describe("ResultArea results grid and per-result actions", () => {
  it("renders a figure per generation id with the full-size image", () => {
    renderResultArea({ generationIds: ["gen-1", "gen-2"] });

    const images = screen.getAllByAltText("Immagine generata");
    expect(images).toHaveLength(2);
    expect(images[0]).toHaveAttribute("src", queries.imageUrl("gen-1"));
    expect(images[1]).toHaveAttribute("src", queries.imageUrl("gen-2"));
  });

  it("offers a download link to the full image", () => {
    renderResultArea({ generationIds: ["gen-1"] });

    const link = screen.getByRole("link", { name: "Scarica" });
    expect(link).toHaveAttribute("href", queries.imageUrl("gen-1"));
    expect(link).toHaveAttribute("download");
  });

  it("links each result to Modifica (word-based edit) and Migliora with that image as source (C13)", () => {
    renderResultArea({ generationIds: ["gen-1"] });

    expect(screen.getByRole("link", { name: "Modifica" })).toHaveAttribute(
      "href",
      "/modifica?source=gen-1&mode=modifica_libera",
    );
    expect(screen.getByRole("link", { name: "Migliora" })).toHaveAttribute("href", "/migliora?source=gen-1");
  });

  it("toggles the favorite and shows its state (C13)", async () => {
    const setFavorite = vi
      .spyOn(queries, "setFavorite")
      .mockImplementation(async (_id, favorite) => ({ favorite }) as never);
    renderResultArea({ generationIds: ["gen-1"] });

    const button = screen.getByRole("button", { name: "Aggiungi ai preferiti" });
    expect(button).toHaveAttribute("aria-pressed", "false");
    await userEvent.click(button);
    expect(setFavorite).toHaveBeenLastCalledWith("gen-1", true);
    expect(await screen.findByRole("button", { name: "Nei preferiti" })).toHaveAttribute("aria-pressed", "true");

    await userEvent.click(screen.getByRole("button", { name: "Nei preferiti" }));
    expect(setFavorite).toHaveBeenLastCalledWith("gen-1", false);
    expect(await screen.findByRole("button", { name: "Aggiungi ai preferiti" })).toBeInTheDocument();
  });

  it("starts another variant and says where it will appear (C13)", async () => {
    const rerunGeneration = vi.spyOn(queries, "rerunGeneration").mockResolvedValue({ job_id: "job-2" });
    renderResultArea({ generationIds: ["gen-1"] });

    await userEvent.click(screen.getByRole("button", { name: "Un'altra variante" }));
    expect(rerunGeneration).toHaveBeenCalledWith("gen-1", true);
    expect(await screen.findByText("Nuova variante avviata: la trovi in Galleria quando è pronta.")).toBeInTheDocument();
  });
});
