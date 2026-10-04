import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ResultArea } from "@/components/create/ResultArea";
import * as queries from "@/api/queries";
import type { JobEvent } from "@/api/types";

function renderResultArea(overrides: Partial<Parameters<typeof ResultArea>[0]> = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const onRetry = vi.fn();
  const onCancel = vi.fn();
  render(
    <QueryClientProvider client={client}>
      <ResultArea
        latestEvent={null}
        generationIds={[]}
        errorMessage={null}
        onRetry={onRetry}
        onCancel={onCancel}
        isRunning={false}
        {...overrides}
      />
    </QueryClientProvider>,
  );
  return { onRetry, onCancel };
}

describe("ResultArea empty/error/running states (SPEC.md § 11.2-11.3)", () => {
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

  it("shows a generic queue message when running with no event yet", () => {
    renderResultArea({ isRunning: true, latestEvent: null });
    expect(screen.getByText("In coda...")).toBeInTheDocument();
  });

  it.each<[JobEvent, string]>([
    [{ type: "queued", position: 3 }, "In coda, posizione 3."],
    [{ type: "model_switch", family: "sdxl", eta_s: 12 }, "Cambio modello, circa 12 secondi."],
    [{ type: "progress", step: 5, total: 30 }, "Passo 5 di 30."],
    [{ type: "completed", generation_ids: ["gen-1"] }, "In corso..."],
    [{ type: "cancelled" }, "In corso..."],
  ])("renders the right progress message for %o", (event, expectedText) => {
    renderResultArea({ isRunning: true, latestEvent: event });
    expect(screen.getByText(expectedText)).toBeInTheDocument();
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

  it("marks a generation as favorite via the API when 'Preferito' is clicked", async () => {
    const setFavorite = vi.spyOn(queries, "setFavorite").mockResolvedValue({} as never);
    renderResultArea({ generationIds: ["gen-1"] });

    await userEvent.click(screen.getByRole("button", { name: "Preferito" }));
    expect(setFavorite).toHaveBeenCalledWith("gen-1", true);
  });

  it("triggers a rerun with a new seed via the API when 'Rigenera' is clicked", async () => {
    const rerunGeneration = vi.spyOn(queries, "rerunGeneration").mockResolvedValue({ job_id: "job-2" });
    renderResultArea({ generationIds: ["gen-1"] });

    await userEvent.click(screen.getByRole("button", { name: "Rigenera" }));
    expect(rerunGeneration).toHaveBeenCalledWith("gen-1", true);
  });
});
