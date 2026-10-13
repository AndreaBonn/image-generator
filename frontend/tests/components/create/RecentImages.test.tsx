import { describe, expect, it, vi, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { RecentImages } from "@/components/create/RecentImages";
import * as queries from "@/api/queries";
import { buildGenerationSummary } from "../../fixtures/generation";

function renderRecent() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <RecentImages />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const meta = { page: 1, per_page: 4, total: 2, total_pages: 1 };

describe("RecentImages (C14)", () => {
  afterEach(() => vi.restoreAllMocks());

  it("shows the latest images and a link to the Galleria", async () => {
    const fetchGenerations = vi.spyOn(queries, "fetchGenerations").mockResolvedValue({
      items: [
        buildGenerationSummary({ id: "gen-1", prompt: "a red fox" }),
        buildGenerationSummary({ id: "gen-2", prompt: "a lighthouse" }),
      ],
      meta,
    });

    renderRecent();

    expect(await screen.findByAltText("a red fox")).toBeInTheDocument();
    expect(screen.getByAltText("a lighthouse")).toBeInTheDocument();
    expect(screen.getByText("Le tue ultime immagini")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Apri la Galleria" })).toHaveAttribute("href", "/galleria");
    expect(fetchGenerations).toHaveBeenCalledWith({ perPage: 4 });
  });

  it("says what to do, without thumbnails, when there is nothing yet", async () => {
    vi.spyOn(queries, "fetchGenerations").mockResolvedValue({ items: [], meta: { ...meta, total: 0 } });

    renderRecent();

    expect(await screen.findByText("Scrivi cosa vuoi vedere e premi Genera.")).toBeInTheDocument();
    expect(screen.queryByText("Le tue ultime immagini")).not.toBeInTheDocument();
  });
});
