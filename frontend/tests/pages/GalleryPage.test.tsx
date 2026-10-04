import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { GalleryPage } from "@/pages/GalleryPage";
import * as queries from "@/api/queries";
import { buildTask } from "../fixtures/task";
import { buildGenerationSummary } from "../fixtures/generation";
import type { PaginationMeta } from "@/api/types";

function meta(overrides: Partial<PaginationMeta> = {}): PaginationMeta {
  return { page: 1, per_page: 24, total: 0, total_pages: 0, ...overrides };
}

function renderGalleryPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <GalleryPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("GalleryPage", () => {
  beforeEach(() => {
    vi.spyOn(queries, "fetchTasks").mockResolvedValue([buildTask()]);
  });

  it("shows the first-use empty state when there are no generations and no filters", async () => {
    vi.spyOn(queries, "fetchGenerations").mockResolvedValue({ items: [], meta: meta() });

    renderGalleryPage();

    expect(
      await screen.findByText(/Non hai ancora generato nessuna immagine/),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Vai a Crea" })).toBeInTheDocument();
  });

  it("renders the thumbnail grid when generations are returned", async () => {
    const items = [
      buildGenerationSummary({ id: "gen-1", prompt: "portrait of an old fisherman" }),
      buildGenerationSummary({ id: "gen-2", prompt: "cozy reading corner" }),
    ];
    vi.spyOn(queries, "fetchGenerations").mockResolvedValue({
      items,
      meta: meta({ total: 2, total_pages: 1 }),
    });

    renderGalleryPage();

    await waitFor(() => expect(screen.getAllByRole("img")).toHaveLength(2));
    expect(screen.getByAltText("portrait of an old fisherman")).toBeInTheDocument();
    expect(screen.queryByText(/Non hai ancora generato/)).not.toBeInTheDocument();
  });

  it("shows an error with a retry action when the gallery fails to load", async () => {
    vi.spyOn(queries, "fetchGenerations").mockRejectedValue(new Error("boom"));

    renderGalleryPage();

    expect(await screen.findByText("Impossibile caricare la galleria.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Riprova" })).toBeInTheDocument();
  });

  it("re-queries with the favorite filter and echoes a no-results search", async () => {
    const fetchGenerationsSpy = vi
      .spyOn(queries, "fetchGenerations")
      .mockResolvedValue({ items: [], meta: meta() });

    renderGalleryPage();
    await screen.findByText(/Non hai ancora generato nessuna immagine/);

    await userEvent.click(screen.getByLabelText("Solo preferiti"));

    await waitFor(() =>
      expect(fetchGenerationsSpy).toHaveBeenLastCalledWith(
        expect.objectContaining({ favorite: true }),
      ),
    );
    expect(
      await screen.findByText(/Nessuna immagine trovata per questa ricerca/),
    ).toBeInTheDocument();
  });
});
