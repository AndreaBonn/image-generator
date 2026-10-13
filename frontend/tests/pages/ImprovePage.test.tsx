import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { ImprovePage } from "@/pages/ImprovePage";
import * as queries from "@/api/queries";
import { ApiError } from "@/api/errors";
import { clipPathForPercent } from "@/lib/beforeAfter";
import { BeforeAfterSlider } from "@/components/common/BeforeAfterSlider";
import { buildTask } from "../fixtures/task";
import { installMockEventSource, latestEventSource } from "../mocks/mockEventSource";
import type { Generation, Task } from "@/api/types";

const NO_IMAGE_REASON = "Carica un'immagine per attivare le azioni qui sotto.";

function allImproveTasks(): Task[] {
  return [
    buildTask({ id: "variazione_sottile", group: "migliora", label: "Variazione leggera" }),
    buildTask({ id: "variazione_forte", group: "migliora", label: "Variazione forte" }),
    buildTask({ id: "upscale", group: "migliora", label: "Ingrandisci" }),
    buildTask({
      id: "rimuovi_sfondo",
      group: "migliora",
      label: "Rimuovi lo sfondo",
      family: "background",
      supports_negative: false,
      prompt_language: { required: "any", label: "Nessuna descrizione necessaria", reason: "Non serve testo." },
    }),
    buildTask({
      id: "ingrandisci_rifinito",
      group: "migliora",
      label: "Ingrandisci con rifinitura",
      supports_negative: false,
      prompt_language: { required: "en", label: "Scrivi in inglese", reason: "Capisce bene solo l'inglese." },
      defaults: { steps: 12, cfg: 4, denoise: 0.3 },
      limits: { steps: { min: 6, max: 30 }, cfg: { min: 1, max: 10 }, denoise: { min: 0.1, max: 0.5 } },
    }),
  ];
}

function buildGenerationDetail(overrides: Partial<Generation> = {}): Generation {
  return {
    id: "gen-source-1",
    job_id: "job-source-1",
    task_id: "qualita",
    model_ids: ["juggernaut-xl-v8"],
    prompt: "a lighthouse at dusk",
    negative_prompt: "",
    prompt_final: "a lighthouse at dusk",
    params: {},
    seed: 7,
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

function improveTasks(upscaleAvailable = true) {
  return [
    buildTask({ id: "variazione_sottile", group: "migliora", label: "Variazione leggera" }),
    buildTask({ id: "variazione_forte", group: "migliora", label: "Variazione forte" }),
    buildTask({
      id: "upscale",
      group: "migliora",
      label: "Ingrandisci",
      available: upscaleAvailable,
      unavailable_reason: upscaleAvailable ? null : "Il modello di ingrandimento non è installato.",
    }),
  ];
}

function renderImprovePage(initialEntries: string[] = ["/migliora"]) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={initialEntries}>
        <ImprovePage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

async function uploadImage() {
  const file = new File(["fake-image-bytes"], "photo.png", { type: "image/png" });
  await userEvent.upload(screen.getByLabelText("Scegli un'immagine da migliorare"), file);
  await waitFor(() => expect(screen.queryByText(NO_IMAGE_REASON)).not.toBeInTheDocument());
}

describe("ImprovePage", () => {
  beforeEach(() => {
    installMockEventSource();
    vi.spyOn(queries, "uploadFile").mockResolvedValue({
      upload_id: "upload-image-1",
      width: 1152,
      height: 896,
    });
    globalThis.URL.createObjectURL = vi.fn(() => "blob:preview");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("disables every action with one shared notice until an image is loaded (P2)", async () => {
    vi.spyOn(queries, "fetchTasks").mockResolvedValue(improveTasks());
    renderImprovePage();

    await screen.findByRole("button", { name: "Variazione leggera" });
    const actionNames = [
      "Variazione leggera",
      "Variazione forte",
      "Ingrandisci",
      "Rimuovi lo sfondo",
      "Ingrandisci con rifinitura",
    ];
    for (const name of actionNames) {
      expect(screen.getByRole("button", { name })).toBeDisabled();
    }
    expect(screen.getAllByText(NO_IMAGE_REASON)).toHaveLength(1);
    expect(screen.queryByText("Carica un'immagine prima di generare.")).not.toBeInTheDocument();

    await uploadImage();
    expect(screen.getByRole("button", { name: "Variazione leggera" })).toBeEnabled();
  });

  it("keeps upscale disabled with the catalog reason when its task is unavailable", async () => {
    vi.spyOn(queries, "fetchTasks").mockResolvedValue(improveTasks(false));
    renderImprovePage();
    await screen.findByRole("button", { name: "Ingrandisci" });
    await uploadImage();

    expect(screen.getByRole("button", { name: "Ingrandisci" })).toBeDisabled();
    expect(screen.getByText("Il modello di ingrandimento non è installato.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Variazione forte" })).toBeEnabled();
  });

  it("falls back to a loading reason for an action missing from the catalog", async () => {
    vi.spyOn(queries, "fetchTasks").mockResolvedValue([
      buildTask({ id: "variazione_forte", group: "migliora", label: "Variazione forte" }),
      buildTask({ id: "upscale", group: "migliora", label: "Ingrandisci" }),
      ...allImproveTasks().filter((t) => t.id === "rimuovi_sfondo" || t.id === "ingrandisci_rifinito"),
    ]);
    renderImprovePage();
    await screen.findByRole("button", { name: "Variazione forte" });
    await uploadImage();

    expect(screen.getByRole("button", { name: "Variazione leggera" })).toBeDisabled();
    expect(screen.getByText("Caricamento compiti...")).toBeInTheDocument();
  });

  it("falls back to a generic reason when an unavailable task has no catalog reason", async () => {
    vi.spyOn(queries, "fetchTasks").mockResolvedValue([
      buildTask({ id: "variazione_sottile", group: "migliora", label: "Variazione leggera" }),
      buildTask({ id: "variazione_forte", group: "migliora", label: "Variazione forte" }),
      buildTask({
        id: "upscale",
        group: "migliora",
        label: "Ingrandisci",
        available: false,
        unavailable_reason: null,
      }),
    ]);
    renderImprovePage();
    await screen.findByRole("button", { name: "Ingrandisci" });
    await uploadImage();

    expect(screen.getByText("Compito non disponibile.")).toBeInTheDocument();
  });

  it("sends a variation job with the optional prompt and the uploaded image", async () => {
    vi.spyOn(queries, "fetchTasks").mockResolvedValue(improveTasks());
    const createJob = vi.spyOn(queries, "createJob").mockResolvedValue({ job_id: "job-1" });
    renderImprovePage();
    await screen.findByRole("button", { name: "Variazione forte" });
    await uploadImage();

    await userEvent.type(screen.getByLabelText("Descrizione (facoltativa)"), "autumn colors");
    await userEvent.click(screen.getByRole("button", { name: "Variazione forte" }));

    await waitFor(() => expect(createJob).toHaveBeenCalledTimes(1));
    const body = createJob.mock.calls[0]?.[0];
    expect(body).toEqual(
      expect.objectContaining({
        task_id: "variazione_forte",
        prompt: "autumn colors",
        input_upload_id: "upload-image-1",
      }),
    );
    expect(body).not.toHaveProperty("upscale_factor");
  });

  it("shows the starting image and marks only the running action as busy", async () => {
    vi.spyOn(queries, "fetchTasks").mockResolvedValue(improveTasks());
    vi.spyOn(queries, "createJob").mockResolvedValue({ job_id: "job-3" });
    renderImprovePage();
    await screen.findByRole("button", { name: "Variazione leggera" });
    await uploadImage();

    expect(screen.getByAltText("Immagine di partenza")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Variazione leggera" }));

    await screen.findByRole("button", { name: "Generazione in corso..." });
    expect(screen.getAllByRole("button", { name: "Generazione in corso..." })).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Variazione forte" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Ingrandisci" })).toBeDisabled();
  });

  it("sends an upscale job with factor 4 and no prompt", async () => {
    vi.spyOn(queries, "fetchTasks").mockResolvedValue(improveTasks());
    const createJob = vi.spyOn(queries, "createJob").mockResolvedValue({ job_id: "job-2" });
    renderImprovePage();
    await screen.findByRole("button", { name: "Ingrandisci" });
    await uploadImage();

    await userEvent.type(screen.getByLabelText("Descrizione (facoltativa)"), "ignored");
    expect(screen.getByText("Diventa 2304×1792 pixel.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("radio", { name: "×4" }));
    expect(screen.getByText("Diventa 4608×3584 pixel.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Ingrandisci" }));

    await waitFor(() => expect(createJob).toHaveBeenCalledTimes(1));
    expect(createJob.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({ task_id: "upscale", prompt: "", upscale_factor: 4 }),
    );
  });

  it("blocks a variation whose prompt is longer than 2000 characters", async () => {
    vi.spyOn(queries, "fetchTasks").mockResolvedValue(improveTasks());
    const createJob = vi.spyOn(queries, "createJob");
    renderImprovePage();
    await screen.findByRole("button", { name: "Variazione leggera" });
    await uploadImage();

    fireEvent.change(screen.getByLabelText("Descrizione (facoltativa)"), {
      target: { value: "a".repeat(2001) },
    });
    await userEvent.click(screen.getByRole("button", { name: "Variazione leggera" }));

    expect(
      await screen.findByText("La descrizione supera i 2000 caratteri."),
    ).toBeInTheDocument();
    expect(createJob).not.toHaveBeenCalled();
  });

  it("shows the result and resubmits the same action when Riprova is clicked after a failure", async () => {
    vi.spyOn(queries, "fetchTasks").mockResolvedValue(improveTasks());
    const createJob = vi.spyOn(queries, "createJob").mockResolvedValue({ job_id: "job-retry" });
    renderImprovePage();
    await screen.findByRole("button", { name: "Variazione forte" });
    await uploadImage();

    await userEvent.click(screen.getByRole("button", { name: "Variazione forte" }));
    await waitFor(() => expect(createJob).toHaveBeenCalledTimes(1));

    const source = await waitFor(() => latestEventSource());
    source.emit("failed", { code: "OUT_OF_MEMORY", message: "Memoria della GPU esaurita." });
    await screen.findByRole("button", { name: "Riprova" });

    await userEvent.click(screen.getByRole("button", { name: "Riprova" }));
    await waitFor(() => expect(createJob).toHaveBeenCalledTimes(2));
    expect(createJob.mock.calls[1]?.[0]).toEqual(
      expect.objectContaining({ task_id: "variazione_forte" }),
    );
  });

  it("re-enables the actions when the server reports the job as cancelled", async () => {
    vi.spyOn(queries, "fetchTasks").mockResolvedValue(improveTasks());
    vi.spyOn(queries, "createJob").mockResolvedValue({ job_id: "job-server-cancel" });
    renderImprovePage();
    await screen.findByRole("button", { name: "Variazione leggera" });
    await uploadImage();

    await userEvent.click(screen.getByRole("button", { name: "Variazione leggera" }));
    const source = await waitFor(() => latestEventSource());
    source.emit("cancelled", {});

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Variazione leggera" })).toBeEnabled(),
    );
  });

  it("cancels the running job when Annulla is clicked", async () => {
    vi.spyOn(queries, "fetchTasks").mockResolvedValue(improveTasks());
    vi.spyOn(queries, "createJob").mockResolvedValue({ job_id: "job-cancel" });
    const cancelSpy = vi.spyOn(queries, "cancelJob").mockResolvedValue(undefined);
    renderImprovePage();
    await screen.findByRole("button", { name: "Variazione leggera" });
    await uploadImage();

    await userEvent.click(screen.getByRole("button", { name: "Variazione leggera" }));
    await screen.findByRole("button", { name: "Annulla" });
    await userEvent.click(screen.getByRole("button", { name: "Annulla" }));

    await waitFor(() => expect(cancelSpy).toHaveBeenCalled());
    expect(cancelSpy.mock.calls[0]?.[0]).toBe("job-cancel");
  });

  it("shows a generic Italian message when job creation fails with a non-API error", async () => {
    vi.spyOn(queries, "fetchTasks").mockResolvedValue(improveTasks());
    vi.spyOn(queries, "createJob").mockRejectedValue(new Error("network down"));
    renderImprovePage();
    await screen.findByRole("button", { name: "Variazione leggera" });
    await uploadImage();

    await userEvent.click(screen.getByRole("button", { name: "Variazione leggera" }));

    expect(
      await screen.findByText("Si è verificato un errore imprevisto."),
    ).toBeInTheDocument();
  });

  it("shows the API error's own Italian message when job creation fails with an ApiError", async () => {
    vi.spyOn(queries, "fetchTasks").mockResolvedValue(improveTasks());
    vi.spyOn(queries, "createJob").mockRejectedValue(
      new ApiError({ code: "MODEL_NOT_INSTALLED", message: "Il modello non è installato.", status: 409 }),
    );
    renderImprovePage();
    await screen.findByRole("button", { name: "Variazione leggera" });
    await uploadImage();

    await userEvent.click(screen.getByRole("button", { name: "Variazione leggera" }));

    expect(await screen.findByText("Il modello non è installato.")).toBeInTheDocument();
  });

  it("shows a before/after comparison once the job completes", async () => {
    vi.spyOn(queries, "fetchTasks").mockResolvedValue(improveTasks());
    vi.spyOn(queries, "createJob").mockResolvedValue({ job_id: "job-complete" });
    renderImprovePage();
    await screen.findByRole("button", { name: "Variazione leggera" });
    await uploadImage();

    await userEvent.click(screen.getByRole("button", { name: "Variazione leggera" }));
    const source = await waitFor(() => latestEventSource());
    source.emit("completed", { generation_ids: ["gen-result-1"] });

    expect(await screen.findByAltText("Risultato, dopo")).toBeInTheDocument();
  });

  it("shows a loading placeholder while a ?source= image is being fetched", async () => {
    vi.spyOn(queries, "fetchTasks").mockResolvedValue(improveTasks());
    let resolveGeneration!: (value: Generation) => void;
    vi.spyOn(queries, "fetchGeneration").mockImplementation(
      () => new Promise((resolve) => (resolveGeneration = resolve)),
    );

    renderImprovePage(["/migliora?source=gen-9"]);

    expect(await screen.findByText("Caricamento immagine...")).toBeInTheDocument();
    expect(screen.queryByLabelText("Scegli un'immagine da migliorare")).not.toBeInTheDocument();

    resolveGeneration(buildGenerationDetail({ id: "gen-9" }));
    await waitFor(() =>
      expect(screen.queryByText("Caricamento immagine...")).not.toBeInTheDocument(),
    );
    expect(screen.getByAltText("Immagine di partenza")).toBeInTheDocument();
  });

  it("uses the source image without re-uploading, so input_upload_id falls back to null", async () => {
    vi.spyOn(queries, "fetchTasks").mockResolvedValue(improveTasks());
    vi.spyOn(queries, "fetchGeneration").mockResolvedValue(buildGenerationDetail({ id: "gen-9" }));
    const createJob = vi.spyOn(queries, "createJob").mockResolvedValue({ job_id: "job-source" });

    renderImprovePage(["/migliora?source=gen-9"]);
    await screen.findByAltText("Immagine di partenza");

    await userEvent.click(screen.getByRole("button", { name: "Variazione leggera" }));

    await waitFor(() => expect(createJob).toHaveBeenCalledTimes(1));
    expect(createJob.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({ input_upload_id: null, source_generation_id: "gen-9" }),
    );
  });

  it("shows the step progress and a disabled running-label action while the job is running", async () => {
    vi.spyOn(queries, "fetchTasks").mockResolvedValue(improveTasks());
    vi.spyOn(queries, "createJob").mockResolvedValue({ job_id: "job-running" });
    renderImprovePage();
    await screen.findByRole("button", { name: "Variazione leggera" });
    await uploadImage();

    await userEvent.click(screen.getByRole("button", { name: "Variazione leggera" }));
    const source = await waitFor(() => latestEventSource());
    source.emit("progress", { step: 7, total: 25 });

    await waitFor(() => expect(screen.getByText("28%")).toBeInTheDocument());
    expect(screen.getByRole("button", { name: "Generazione in corso..." })).toBeDisabled();
  });
});

describe("ImprovePage - rimuovi lo sfondo e ingrandisci con rifinitura", () => {
  beforeEach(() => {
    installMockEventSource();
    vi.spyOn(queries, "uploadFile").mockResolvedValue({
      upload_id: "upload-image-1",
      width: 1152,
      height: 896,
    });
    globalThis.URL.createObjectURL = vi.fn(() => "blob:preview");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("sends a background-removal job without a prompt", async () => {
    vi.spyOn(queries, "fetchTasks").mockResolvedValue(allImproveTasks());
    const createJob = vi.spyOn(queries, "createJob").mockResolvedValue({ job_id: "job-bg" });
    renderImprovePage();
    await screen.findByRole("button", { name: "Rimuovi lo sfondo" });
    await uploadImage();

    await userEvent.click(screen.getByRole("button", { name: "Rimuovi lo sfondo" }));

    await waitFor(() => expect(createJob).toHaveBeenCalledTimes(1));
    expect(createJob.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({ task_id: "rimuovi_sfondo", prompt: "", input_upload_id: "upload-image-1" }),
    );
  });

  it("disables rimuovi lo sfondo with the catalog reason when unavailable", async () => {
    const tasks = allImproveTasks().map((t) =>
      t.id === "rimuovi_sfondo"
        ? { ...t, available: false, unavailable_reason: "Il modello BiRefNet non è installato." }
        : t,
    );
    vi.spyOn(queries, "fetchTasks").mockResolvedValue(tasks);
    renderImprovePage();
    await screen.findByRole("button", { name: "Rimuovi lo sfondo" });
    await uploadImage();

    expect(screen.getByRole("button", { name: "Rimuovi lo sfondo" })).toBeDisabled();
    expect(screen.getByText("Il modello BiRefNet non è installato.")).toBeInTheDocument();
  });

  it("shows the transparent result on a checkerboard after a background-removal job completes", async () => {
    vi.spyOn(queries, "fetchTasks").mockResolvedValue(allImproveTasks());
    vi.spyOn(queries, "createJob").mockResolvedValue({ job_id: "job-bg-done" });
    renderImprovePage();
    await screen.findByRole("button", { name: "Rimuovi lo sfondo" });
    await uploadImage();

    await userEvent.click(screen.getByRole("button", { name: "Rimuovi lo sfondo" }));
    const source = await waitFor(() => latestEventSource());
    source.emit("completed", { generation_ids: ["gen-bg-1"] });

    const after = await screen.findByAltText("Risultato, dopo");
    const checkerboard = after.parentElement?.querySelector(".bg-checkerboard");
    expect(checkerboard).not.toBeNull();
  });

  it("shows the estimated duration and sends denoise + optional English prompt for the refined upscale", async () => {
    vi.spyOn(queries, "fetchTasks").mockResolvedValue(allImproveTasks());
    const createJob = vi.spyOn(queries, "createJob").mockResolvedValue({ job_id: "job-refine" });
    renderImprovePage();
    await screen.findByRole("button", { name: "Ingrandisci con rifinitura" });
    await uploadImage();

    expect(screen.getByText("Tempo stimato: circa 1-2 minuti.")).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText("Descrizione per la rifinitura (facoltativa)"), "sharp fabric texture");
    const slider = screen.getByLabelText("Quanto può cambiare i dettagli");
    expect(slider).toHaveAttribute("aria-valuetext", "abbastanza");
    expect(screen.getByText("Fedele all'originale")).toBeInTheDocument();
    expect(screen.getByText("Più inventiva")).toBeInTheDocument();
    fireEvent.change(slider, { target: { value: "0.4" } });
    expect(slider).toHaveAttribute("aria-valuetext", "molto");
    await userEvent.click(screen.getByRole("button", { name: "Ingrandisci con rifinitura" }));

    await waitFor(() => expect(createJob).toHaveBeenCalledTimes(1));
    expect(createJob.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({
        task_id: "ingrandisci_rifinito",
        prompt: "sharp fabric texture",
        params: expect.objectContaining({ denoise: 0.4 }),
      }),
    );
  });

  it("blocks a refined upscale whose prompt is longer than 2000 characters", async () => {
    vi.spyOn(queries, "fetchTasks").mockResolvedValue(allImproveTasks());
    const createJob = vi.spyOn(queries, "createJob");
    renderImprovePage();
    await screen.findByRole("button", { name: "Ingrandisci con rifinitura" });
    await uploadImage();

    fireEvent.change(screen.getByLabelText("Descrizione per la rifinitura (facoltativa)"), {
      target: { value: "a".repeat(2001) },
    });
    await userEvent.click(screen.getByRole("button", { name: "Ingrandisci con rifinitura" }));

    expect(await screen.findByText("La descrizione supera i 2000 caratteri.")).toBeInTheDocument();
    expect(createJob).not.toHaveBeenCalled();
  });

  it("disables ingrandisci con rifinitura with the catalog reason when unavailable", async () => {
    const tasks = allImproveTasks().map((t) =>
      t.id === "ingrandisci_rifinito"
        ? { ...t, available: false, unavailable_reason: "Il modello di rifinitura non è installato." }
        : t,
    );
    vi.spyOn(queries, "fetchTasks").mockResolvedValue(tasks);
    renderImprovePage();
    await screen.findByRole("button", { name: "Ingrandisci con rifinitura" });
    await uploadImage();

    expect(screen.getByRole("button", { name: "Ingrandisci con rifinitura" })).toBeDisabled();
    expect(screen.getByText("Il modello di rifinitura non è installato.")).toBeInTheDocument();
  });
});

describe("before/after comparison", () => {
  it("clips the after image to the slider percentage, clamped to 0-100", () => {
    expect(clipPathForPercent(30)).toBe("inset(0 70% 0 0)");
    expect(clipPathForPercent(-5)).toBe("inset(0 100% 0 0)");
    expect(clipPathForPercent(140)).toBe("inset(0 0% 0 0)");
  });

  it("moves the visible portion when the slider changes", () => {
    render(<BeforeAfterSlider beforeUrl="/before.png" afterUrl="/after.png" sliderId="cmp" />);
    const after = screen.getByAltText("Risultato, dopo");
    expect(after.style.clipPath).toBe("inset(0 50% 0 0)");

    fireEvent.change(screen.getByLabelText("Confronto prima/dopo"), { target: { value: "80" } });
    expect(after.style.clipPath).toBe("inset(0 20% 0 0)");
  });

  it("renders a checkerboard behind a transparent after-image, clipped to the same percentage", () => {
    const { container } = render(
      <BeforeAfterSlider beforeUrl="/before.png" afterUrl="/after.png" sliderId="cmp-alpha" transparentAfter />,
    );
    const checkerboard = container.querySelector(".bg-checkerboard") as HTMLElement | null;
    expect(checkerboard).not.toBeNull();
    expect(checkerboard?.style.clipPath).toBe("inset(0 50% 0 0)");
  });

  it("omits the checkerboard when the result is opaque", () => {
    const { container } = render(<BeforeAfterSlider beforeUrl="/before.png" afterUrl="/after.png" sliderId="cmp-opaque" />);
    expect(container.querySelector(".bg-checkerboard")).toBeNull();
  });
});
