import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { EditPage } from "@/pages/EditPage";
import * as queries from "@/api/queries";
import { buildTask } from "../fixtures/task";
import { buildGenerationSummary } from "../fixtures/generation";
import { installMockEventSource, latestEventSource } from "../mocks/mockEventSource";
import type { Generation } from "@/api/types";

function buildGeneration(id: string): Generation {
  return {
    id,
    job_id: `job-${id}`,
    task_id: "foto",
    model_ids: ["zimage_turbo"],
    prompt: "una coppia al mare",
    negative_prompt: "",
    prompt_final: "una coppia al mare",
    params: {},
    seed: 7,
    width: 1152,
    height: 896,
    parent_id: null,
    duration_ms: 17000,
    favorite: false,
    created_at: "2026-10-13T10:00:00Z",
    updated_at: "2026-10-13T10:00:00Z",
  };
}

function renderEditPage(initialEntry: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <EditPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("EditPage - chained word-based edits", () => {
  beforeEach(() => {
    installMockEventSource();
    vi.spyOn(queries, "fetchTasks").mockResolvedValue([
      buildTask({ id: "modifica_libera", group: "modifica", label: "Modifica con le parole", supports_negative: false }),
      buildTask({ id: "inpaint", group: "modifica", label: "Modifica una parte" }),
      buildTask({ id: "outpaint", group: "modifica", label: "Allarga l'immagine" }),
    ]);
    vi.spyOn(queries, "fetchGeneration").mockImplementation((id) => Promise.resolve(buildGeneration(id)));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("lets the user pick the image to edit from the Galleria (M2)", async () => {
    vi.spyOn(queries, "fetchGenerations").mockResolvedValue({
      items: [buildGenerationSummary({ id: "gen-5", prompt: "un faro al tramonto" })],
      meta: { page: 1, per_page: 24, total: 1, total_pages: 1 },
    });
    renderEditPage("/modifica");

    await userEvent.click(await screen.findByRole("button", { name: "Scegli dalla Galleria" }));
    await userEvent.click(await screen.findByRole("button", { name: "Modifica questa immagine: un faro al tramonto" }));

    await waitFor(() =>
      expect(screen.getByAltText("Immagine da modificare")).toHaveAttribute("src", queries.imageUrl("gen-5")),
    );
    expect(screen.getByRole("tab", { name: "Modifica con le parole" })).toHaveAttribute("aria-selected", "true");
  });

  it("opens on the word-based tab with the source image shown when ?mode=modifica_libera", async () => {
    renderEditPage("/modifica?source=gen-1&mode=modifica_libera");

    expect(await screen.findByRole("tab", { name: "Modifica con le parole" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(await screen.findByAltText("Immagine da modificare")).toHaveAttribute(
      "src",
      queries.imageUrl("gen-1"),
    );
  });

  it("falls back to the default free-edit tab when the mode parameter is not a known edit mode", async () => {
    renderEditPage("/modifica?source=gen-1&mode=sconosciuto");

    expect(await screen.findByRole("tab", { name: "Modifica con le parole" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  it("hides the previous result while a new edit runs, so its link cannot orphan the running job", async () => {
    vi.spyOn(queries, "createJob")
      .mockResolvedValueOnce({ job_id: "job-step-1" })
      .mockResolvedValueOnce({ job_id: "job-step-2" });
    renderEditPage("/modifica?source=gen-1&mode=modifica_libera");
    await screen.findByAltText("Immagine da modificare");

    await userEvent.type(screen.getByLabelText("Descrizione"), "aggiungi un cane");
    await userEvent.click(screen.getByRole("button", { name: "Genera" }));
    await waitFor(() => latestEventSource());
    latestEventSource().emit("completed", { generation_ids: ["gen-2"] });
    expect(await screen.findByRole("link", { name: "Modifica" })).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Genera" }));

    await screen.findByRole("button", { name: "Annulla" });
    expect(screen.queryByRole("link", { name: "Modifica" })).not.toBeInTheDocument();
  });

  it("edits the result of an edit: the new result becomes the source of the next job", async () => {
    const createJobSpy = vi
      .spyOn(queries, "createJob")
      .mockResolvedValueOnce({ job_id: "job-step-1" })
      .mockResolvedValueOnce({ job_id: "job-step-2" });
    renderEditPage("/modifica?source=gen-1&mode=modifica_libera");
    await screen.findByAltText("Immagine da modificare");

    await userEvent.type(screen.getByLabelText("Descrizione"), "aggiungi un cane sulla sabbia");
    await userEvent.click(screen.getByRole("button", { name: "Genera" }));
    await waitFor(() => expect(createJobSpy).toHaveBeenCalledTimes(1));
    latestEventSource().emit("completed", { generation_ids: ["gen-2"] });

    await userEvent.click(await screen.findByRole("link", { name: "Modifica" }));

    await waitFor(() =>
      expect(screen.getByAltText("Immagine da modificare")).toHaveAttribute("src", queries.imageUrl("gen-2")),
    );
    expect(screen.getByLabelText("Descrizione")).toHaveValue("");
    expect(screen.queryByAltText("Immagine generata")).not.toBeInTheDocument();

    await userEvent.type(screen.getByLabelText("Descrizione"), "rendi il cielo al tramonto");
    await userEvent.click(screen.getByRole("button", { name: "Genera" }));

    await waitFor(() => expect(createJobSpy).toHaveBeenCalledTimes(2));
    expect(createJobSpy.mock.calls[1]?.[0]).toEqual(
      expect.objectContaining({
        task_id: "modifica_libera",
        prompt: "rendi il cielo al tramonto",
        source_generation_id: "gen-2",
        input_upload_id: null,
      }),
    );
  });
});
