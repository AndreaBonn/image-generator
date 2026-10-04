import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TrashView } from "@/components/gallery/TrashView";
import * as queries from "@/api/queries";
import { buildGenerationSummary } from "../../fixtures/generation";
import type { PaginationMeta } from "@/api/types";

function meta(overrides: Partial<PaginationMeta> = {}): PaginationMeta {
  return { page: 1, per_page: 24, total: 0, total_pages: 0, ...overrides };
}

function renderTrashView() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <TrashView />
    </QueryClientProvider>,
  );
}

describe("TrashView", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("lists trashed items by calling fetchGenerations with trashed=true", async () => {
    const fetchGenerationsSpy = vi.spyOn(queries, "fetchGenerations").mockResolvedValue({
      items: [buildGenerationSummary({ id: "gen-1", prompt: "portrait of an old fisherman" })],
      meta: meta({ total: 1, total_pages: 1 }),
    });
    vi.spyOn(queries, "fetchTrashSummary").mockResolvedValue({ count: 1, bytes: 1024 });

    renderTrashView();

    await waitFor(() =>
      expect(fetchGenerationsSpy).toHaveBeenCalledWith(expect.objectContaining({ trashed: true })),
    );
    expect(await screen.findByAltText("portrait of an old fisherman")).toBeInTheDocument();
  });

  it("shows the empty-trash state when there are no trashed items", async () => {
    vi.spyOn(queries, "fetchGenerations").mockResolvedValue({ items: [], meta: meta() });
    vi.spyOn(queries, "fetchTrashSummary").mockResolvedValue({ count: 0, bytes: 0 });

    renderTrashView();

    expect(await screen.findByText("Il cestino è vuoto.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Svuota il cestino" })).not.toBeInTheDocument();
  });

  it("restores a trashed item via POST /generations/{id}/restore when Ripristina is clicked", async () => {
    vi.spyOn(queries, "fetchGenerations").mockResolvedValue({
      items: [buildGenerationSummary({ id: "gen-1", prompt: "cozy reading corner" })],
      meta: meta({ total: 1, total_pages: 1 }),
    });
    vi.spyOn(queries, "fetchTrashSummary").mockResolvedValue({ count: 1, bytes: 1024 });
    const restoreSpy = vi.spyOn(queries, "restoreGeneration").mockResolvedValue({
      id: "gen-1",
      job_id: "job-1",
      task_id: "qualita",
      model_ids: [],
      prompt: "cozy reading corner",
      negative_prompt: "",
      prompt_final: "cozy reading corner",
      params: {},
      seed: 1,
      width: 1152,
      height: 896,
      parent_id: null,
      duration_ms: null,
      favorite: false,
      created_at: "2026-10-01T10:00:00Z",
      updated_at: "2026-10-01T10:00:00Z",
    });

    renderTrashView();
    await screen.findByAltText("cozy reading corner");

    await userEvent.click(screen.getByRole("button", { name: "Ripristina" }));

    await waitFor(() => expect(restoreSpy).toHaveBeenCalledWith("gen-1"));
  });

  it("shows the trash summary count and human-readable size, and empties it only after confirming", async () => {
    vi.spyOn(queries, "fetchGenerations").mockResolvedValue({
      items: [buildGenerationSummary({ id: "gen-1" })],
      meta: meta({ total: 1, total_pages: 1 }),
    });
    vi.spyOn(queries, "fetchTrashSummary").mockResolvedValue({ count: 3, bytes: 3 * 1024 ** 3 });
    const emptyTrashSpy = vi.spyOn(queries, "emptyTrash");

    renderTrashView();

    expect(await screen.findByText("3 immagini, 3,0 GB")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Svuota il cestino" }));
    const dialog = await screen.findByRole("dialog", { name: "Svuotare il cestino?" });
    expect(screen.getByText(/Verranno eliminate per sempre 3 immagini, liberando 3,0 GB/)).toBeInTheDocument();

    await userEvent.click(within(dialog).getByRole("button", { name: "Annulla" }));
    expect(emptyTrashSpy).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog", { name: "Svuotare il cestino?" })).not.toBeInTheDocument();
  });

  it("calls POST /generations/trash/empty only after the dialog is confirmed", async () => {
    vi.spyOn(queries, "fetchGenerations").mockResolvedValue({
      items: [buildGenerationSummary({ id: "gen-1" })],
      meta: meta({ total: 1, total_pages: 1 }),
    });
    vi.spyOn(queries, "fetchTrashSummary").mockResolvedValue({ count: 1, bytes: 1024 });
    const emptyTrashSpy = vi.spyOn(queries, "emptyTrash").mockResolvedValue({ purged: 1, freed_bytes: 1024 });

    renderTrashView();
    await screen.findByRole("button", { name: "Svuota il cestino" });

    await userEvent.click(screen.getByRole("button", { name: "Svuota il cestino" }));
    const dialog = await screen.findByRole("dialog", { name: "Svuotare il cestino?" });
    await userEvent.click(within(dialog).getByRole("button", { name: "Svuota il cestino" }));

    await waitFor(() => expect(emptyTrashSpy).toHaveBeenCalledTimes(1));
    expect(await screen.findByText(/Liberati/)).toBeInTheDocument();
  });
});
