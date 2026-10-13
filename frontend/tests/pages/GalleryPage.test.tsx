import { afterEach, describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { GalleryPage } from "@/pages/GalleryPage";
import * as queries from "@/api/queries";
import { buildTask } from "../fixtures/task";
import { buildGenerationSummary } from "../fixtures/generation";
import { installMockEventSource, latestEventSource } from "../mocks/mockEventSource";
import type { Generation, PaginationMeta } from "@/api/types";

function meta(overrides: Partial<PaginationMeta> = {}): PaginationMeta {
  return { page: 1, per_page: 24, total: 0, total_pages: 0, ...overrides };
}

function buildGenerationDetail(overrides: Partial<Generation> = {}): Generation {
  return {
    id: "gen-1",
    job_id: "job-1",
    task_id: "qualita",
    model_ids: ["juggernaut-xl-v8"],
    prompt: "portrait of an old fisherman",
    negative_prompt: "",
    prompt_final: "portrait of an old fisherman",
    params: {},
    seed: 42,
    width: 1152,
    height: 896,
    parent_id: null,
    duration_ms: 4200,
    favorite: false,
    created_at: "2026-10-01T10:00:00Z",
    updated_at: "2026-10-01T10:00:00Z",
    ...overrides,
  };
}

/** jsdom has no IntersectionObserver; GenerationGrid's scroll-pagination
 * sentinel needs one to invoke its callback (SPEC.md § 11.2, infinite scroll). */
class FakeIntersectionObserver implements IntersectionObserver {
  static instances: FakeIntersectionObserver[] = [];
  readonly root = null;
  readonly rootMargin = "";
  readonly thresholds: ReadonlyArray<number> = [];
  callback: IntersectionObserverCallback;

  constructor(callback: IntersectionObserverCallback) {
    this.callback = callback;
    FakeIntersectionObserver.instances.push(this);
  }

  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
  takeRecords = vi.fn(() => []);

  intersect() {
    this.callback(
      [{ isIntersecting: true } as IntersectionObserverEntry],
      this as unknown as IntersectionObserver,
    );
  }
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

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
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

    await userEvent.click(screen.getByRole("button", { name: "★ Preferite" }));

    await waitFor(() =>
      expect(fetchGenerationsSpy).toHaveBeenLastCalledWith(
        expect.objectContaining({ favorite: true }),
      ),
    );
    expect(
      await screen.findByText(/Nessuna immagine trovata per questa ricerca/),
    ).toBeInTheDocument();
  });

  it("retries the failed query from scratch when Riprova is clicked", async () => {
    const fetchGenerationsSpy = vi
      .spyOn(queries, "fetchGenerations")
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValueOnce({
        items: [buildGenerationSummary({ id: "gen-1" })],
        meta: meta({ total: 1, total_pages: 1 }),
      });

    renderGalleryPage();
    await screen.findByText("Impossibile caricare la galleria.");

    await userEvent.click(screen.getByRole("button", { name: "Riprova" }));

    await waitFor(() => expect(fetchGenerationsSpy).toHaveBeenCalledTimes(2));
    await waitFor(() =>
      expect(screen.queryByText("Impossibile caricare la galleria.")).not.toBeInTheDocument(),
    );
    expect(await screen.findByRole("img")).toBeInTheDocument();
  });

  it("re-queries with the task ids of the chosen kind of work (G3)", async () => {
    vi.spyOn(queries, "fetchTasks").mockResolvedValue([
      buildTask(),
      buildTask({ id: "upscale", group: "migliora", label: "Ingrandisci" }),
    ]);
    const fetchGenerationsSpy = vi
      .spyOn(queries, "fetchGenerations")
      .mockResolvedValue({ items: [], meta: meta() });

    renderGalleryPage();
    await screen.findByText(/Non hai ancora generato nessuna immagine/);

    await userEvent.click(screen.getByRole("button", { name: "Migliorate" }));

    await waitFor(() =>
      expect(fetchGenerationsSpy).toHaveBeenLastCalledWith(
        expect.objectContaining({ taskIds: ["upscale"] }),
      ),
    );
  });

  it("loads the next page when the scroll sentinel intersects", async () => {
    vi.stubGlobal("IntersectionObserver", FakeIntersectionObserver);
    FakeIntersectionObserver.instances = [];

    const fetchGenerationsSpy = vi
      .spyOn(queries, "fetchGenerations")
      .mockImplementation(async (params) => {
        const page = params.page ?? 1;
        if (page === 1) {
          return {
            items: [buildGenerationSummary({ id: "gen-1", prompt: "page one" })],
            meta: meta({ page: 1, total: 2, total_pages: 2 }),
          };
        }
        return {
          items: [buildGenerationSummary({ id: "gen-2", prompt: "page two" })],
          meta: meta({ page: 2, total: 2, total_pages: 2 }),
        };
      });

    renderGalleryPage();
    await screen.findByAltText("page one");

    const observer = FakeIntersectionObserver.instances.at(-1);
    expect(observer).toBeDefined();
    observer?.intersect();

    await waitFor(() => expect(fetchGenerationsSpy).toHaveBeenCalledTimes(2));
    expect(fetchGenerationsSpy.mock.calls[1]?.[0]).toEqual(expect.objectContaining({ page: 2 }));
    expect(await screen.findByAltText("page two")).toBeInTheDocument();

  });

  it("follows a variant started from the detail and refreshes the gallery when it is ready (G6)", async () => {
    installMockEventSource();
    const fetchGenerationsSpy = vi.spyOn(queries, "fetchGenerations").mockResolvedValue({
      items: [buildGenerationSummary({ id: "gen-1", prompt: "portrait of an old fisherman" })],
      meta: meta({ total: 1, total_pages: 1 }),
    });
    vi.spyOn(queries, "fetchGeneration").mockResolvedValue(buildGenerationDetail());
    vi.spyOn(queries, "rerunGeneration").mockResolvedValue({ job_id: "job-7" });

    renderGalleryPage();
    await userEvent.click(await screen.findByRole("button", { name: /portrait of an old fisherman/ }));
    await userEvent.click(await screen.findByRole("button", { name: "Un'altra variante" }));
    await userEvent.click(screen.getByRole("button", { name: "Chiudi" }));

    expect(await screen.findByText("Nuova variante in preparazione...")).toBeInTheDocument();
    const callsBefore = fetchGenerationsSpy.mock.calls.length;
    latestEventSource().emit("completed", { generation_ids: ["gen-8"] });

    expect(await screen.findByText("Nuova variante pronta: è in cima alla Galleria.")).toBeInTheDocument();
    await waitFor(() => expect(fetchGenerationsSpy.mock.calls.length).toBeGreaterThan(callsBefore));
  });

  it("opens the detail dialog on a thumbnail click and closes it", async () => {
    vi.spyOn(queries, "fetchGenerations").mockResolvedValue({
      items: [buildGenerationSummary({ id: "gen-1", prompt: "portrait of an old fisherman" })],
      meta: meta({ total: 1, total_pages: 1 }),
    });
    vi.spyOn(queries, "fetchGeneration").mockResolvedValue(buildGenerationDetail());

    renderGalleryPage();
    await userEvent.click(await screen.findByRole("button", { name: /portrait of an old fisherman/ }));

    expect(await screen.findByRole("dialog", { name: "Dettaglio immagine" })).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Chiudi" }));
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "Dettaglio immagine" })).not.toBeInTheDocument(),
    );
  });
});
