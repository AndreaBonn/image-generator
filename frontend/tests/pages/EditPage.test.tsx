import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { EditPage } from "@/pages/EditPage";
import * as queries from "@/api/queries";
import { ApiError } from "@/api/errors";
import * as maskExportLib from "@/lib/maskExport";
import { buildTask } from "../fixtures/task";
import { installMockEventSource, latestEventSource } from "../mocks/mockEventSource";
import type { Generation, Task } from "@/api/types";

const IMAGE_WIDTH = 200;
const IMAGE_HEIGHT = 150;

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
    width: IMAGE_WIDTH,
    height: IMAGE_HEIGHT,
    parent_id: null,
    duration_ms: 4200,
    favorite: false,
    created_at: "2026-10-01T10:00:00Z",
    updated_at: "2026-10-01T10:00:00Z",
    ...overrides,
  };
}

function renderEditPage(initialEntries: string[] = ["/modifica"]) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={initialEntries}>
        <EditPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

async function uploadSourceImage() {
  const file = new File(["fake-image-bytes"], "source.png", { type: "image/png" });
  const input = screen.getByLabelText("Scegli un'immagine da modificare");
  await userEvent.upload(input, file);
  await waitFor(() => expect(screen.queryByText("Trascina un'immagine qui, oppure")).not.toBeInTheDocument());
}

async function paintMaskStroke() {
  const canvas = document.querySelector("canvas");
  if (!canvas) throw new Error("mask canvas not found");
  await userEvent.pointer([
    { target: canvas, coords: { clientX: 100, clientY: 75 } },
    { keys: "[MouseLeft]", target: canvas, coords: { clientX: 100, clientY: 75 } },
  ]);
}

describe("EditPage", () => {
  let originalGetBoundingClientRect: typeof Element.prototype.getBoundingClientRect;

  beforeEach(() => {
    installMockEventSource();

    vi.spyOn(queries, "fetchTasks").mockResolvedValue([
      buildTask({ id: "inpaint", group: "modifica", label: "Modifica una parte" }),
      buildTask({ id: "outpaint", group: "modifica", label: "Allarga l'immagine" }),
    ]);
    vi.spyOn(queries, "uploadFile").mockImplementation((_file, kind) =>
      Promise.resolve(
        kind === "image"
          ? { upload_id: "upload-image-1", width: IMAGE_WIDTH, height: IMAGE_HEIGHT }
          : { upload_id: "upload-mask-1", width: IMAGE_WIDTH, height: IMAGE_HEIGHT },
      ),
    );

    // jsdom reports every bounding rect as all-zero, which makes the mask
    // editor's pointer -> pixel math collapse to Infinity (SPEC.md § 11.2
    // canvas). Give the canvas a real-looking rect so a simulated stroke
    // actually paints pixels, and stub pointer capture (unimplemented in
    // jsdom) so the pointerdown handler doesn't throw.
    originalGetBoundingClientRect = Element.prototype.getBoundingClientRect;
    Element.prototype.getBoundingClientRect = vi.fn(
      () =>
        ({
          width: IMAGE_WIDTH,
          height: IMAGE_HEIGHT,
          top: 0,
          left: 0,
          right: IMAGE_WIDTH,
          bottom: IMAGE_HEIGHT,
          x: 0,
          y: 0,
          toJSON: () => ({}),
        }) as DOMRect,
    );
    Element.prototype.setPointerCapture = vi.fn();
    Element.prototype.releasePointerCapture = vi.fn();
  });

  afterEach(() => {
    Element.prototype.getBoundingClientRect = originalGetBoundingClientRect;
    vi.restoreAllMocks();
  });

  it("disables Genera without a mask in inpaint mode, and without a direction in outpaint mode", async () => {
    renderEditPage();
    await uploadSourceImage();

    expect(screen.getByRole("button", { name: "Genera" })).toBeDisabled();
    expect(
      screen.getByText("Disegna la zona da modificare prima di generare."),
    ).toBeInTheDocument();

    await userEvent.click(screen.getByRole("tab", { name: "Allarga l'immagine" }));

    expect(screen.getByRole("button", { name: "Genera" })).toBeDisabled();
    expect(
      screen.getByText("Scegli almeno una direzione prima di generare."),
    ).toBeInTheDocument();
  });

  it("sends the correct inpaint job body: input image, drawn mask, prompt", async () => {
    vi.spyOn(maskExportLib, "exportMaskPng").mockResolvedValue(
      new Blob(["fake-mask-png"], { type: "image/png" }),
    );
    const createJobSpy = vi
      .spyOn(queries, "createJob")
      .mockResolvedValue({ job_id: "job-inpaint-1" });

    renderEditPage();
    await uploadSourceImage();
    await paintMaskStroke();

    await userEvent.type(screen.getByLabelText("Descrizione"), "fix the torn sail");

    expect(screen.getByRole("button", { name: "Genera" })).not.toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: "Genera" }));

    await waitFor(() => expect(createJobSpy).toHaveBeenCalledTimes(1));
    expect(createJobSpy.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({
        task_id: "inpaint",
        prompt: "fix the torn sail",
        input_upload_id: "upload-image-1",
        mask_upload_id: "upload-mask-1",
        source_generation_id: null,
      }),
    );
  });

  it("sends the correct outpaint job body: input image, chosen directions", async () => {
    const createJobSpy = vi
      .spyOn(queries, "createJob")
      .mockResolvedValue({ job_id: "job-outpaint-1" });

    renderEditPage();
    await uploadSourceImage();

    await userEvent.click(screen.getByRole("tab", { name: "Allarga l'immagine" }));
    await userEvent.click(screen.getByRole("button", { name: "Sopra" }));
    await userEvent.click(screen.getByRole("button", { name: "Destra" }));

    expect(screen.getByRole("button", { name: "Genera" })).not.toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: "Genera" }));

    await waitFor(() => expect(createJobSpy).toHaveBeenCalledTimes(1));
    expect(createJobSpy.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({
        task_id: "outpaint",
        input_upload_id: "upload-image-1",
        outpaint_directions: ["top", "right"],
        source_generation_id: null,
      }),
    );
  });

  it("switches back to the inpaint tab and shows the mask editor again", async () => {
    renderEditPage();
    await uploadSourceImage();

    await userEvent.click(screen.getByRole("tab", { name: "Allarga l'immagine" }));
    expect(screen.getByRole("tab", { name: "Allarga l'immagine" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(document.querySelector("canvas")).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("tab", { name: "Modifica una parte" }));
    expect(screen.getByRole("tab", { name: "Modifica una parte" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(document.querySelector("canvas")).toBeInTheDocument();
  });

  it("loads an image passed via ?source= and sends it without a fresh upload", async () => {
    vi.spyOn(maskExportLib, "exportMaskPng").mockResolvedValue(
      new Blob(["fake-mask-png"], { type: "image/png" }),
    );
    const fetchGenerationSpy = vi
      .spyOn(queries, "fetchGeneration")
      .mockResolvedValue(buildGenerationDetail({ id: "gen-9" }));
    const createJobSpy = vi
      .spyOn(queries, "createJob")
      .mockResolvedValue({ job_id: "job-from-source" });

    renderEditPage(["/modifica?source=gen-9"]);

    await waitFor(() => expect(fetchGenerationSpy).toHaveBeenCalledWith("gen-9", expect.anything()));
    await waitFor(() =>
      expect(screen.queryByLabelText("Scegli un'immagine da modificare")).not.toBeInTheDocument(),
    );
    expect(document.querySelector("canvas")).toBeInTheDocument();

    await paintMaskStroke();
    await userEvent.type(screen.getByLabelText("Descrizione"), "brighten the sky");
    await userEvent.click(screen.getByRole("button", { name: "Genera" }));

    await waitFor(() => expect(createJobSpy).toHaveBeenCalledTimes(1));
    expect(createJobSpy.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({ input_upload_id: null, source_generation_id: "gen-9" }),
    );
  });

  it("shows the generated images once the job completes", async () => {
    vi.spyOn(queries, "createJob").mockResolvedValue({ job_id: "job-complete" });
    renderEditPage();
    await uploadSourceImage();

    await userEvent.click(screen.getByRole("tab", { name: "Allarga l'immagine" }));
    await userEvent.click(screen.getByRole("button", { name: "Sopra" }));
    await userEvent.click(screen.getByRole("button", { name: "Genera" }));

    const source = await waitFor(() => latestEventSource());
    source.emit("completed", { generation_ids: ["gen-done"] });

    await waitFor(() => expect(screen.getByAltText("Immagine generata")).toBeInTheDocument());
  });

  it("re-enables Genera when the server reports the job as cancelled", async () => {
    vi.spyOn(queries, "createJob").mockResolvedValue({ job_id: "job-server-cancel" });
    renderEditPage();
    await uploadSourceImage();

    await userEvent.click(screen.getByRole("tab", { name: "Allarga l'immagine" }));
    await userEvent.click(screen.getByRole("button", { name: "Sopra" }));
    await userEvent.click(screen.getByRole("button", { name: "Genera" }));

    const source = await waitFor(() => latestEventSource());
    source.emit("cancelled", {});

    await waitFor(() => expect(screen.getByRole("button", { name: "Genera" })).toBeEnabled());
  });

  it("cancels the running job when Annulla is clicked", async () => {
    vi.spyOn(queries, "createJob").mockResolvedValue({ job_id: "job-to-cancel" });
    const cancelSpy = vi.spyOn(queries, "cancelJob").mockResolvedValue(undefined);
    renderEditPage();
    await uploadSourceImage();

    await userEvent.click(screen.getByRole("tab", { name: "Allarga l'immagine" }));
    await userEvent.click(screen.getByRole("button", { name: "Sopra" }));
    await userEvent.click(screen.getByRole("button", { name: "Genera" }));

    await screen.findByRole("button", { name: "Annulla" });
    await userEvent.click(screen.getByRole("button", { name: "Annulla" }));

    await waitFor(() => expect(cancelSpy).toHaveBeenCalled());
    expect(cancelSpy.mock.calls[0]?.[0]).toBe("job-to-cancel");
    await waitFor(() => expect(screen.queryByRole("button", { name: "Annulla" })).not.toBeInTheDocument());
  });

  it("shows a generic Italian message when job creation fails with a non-API error", async () => {
    vi.spyOn(queries, "createJob").mockRejectedValue(new Error("network down"));
    renderEditPage();
    await uploadSourceImage();

    await userEvent.click(screen.getByRole("tab", { name: "Allarga l'immagine" }));
    await userEvent.click(screen.getByRole("button", { name: "Sopra" }));
    await userEvent.click(screen.getByRole("button", { name: "Genera" }));

    expect(
      await screen.findByText("Si è verificato un errore imprevisto."),
    ).toBeInTheDocument();
  });

  it("shows the API error's own Italian message when job creation fails with an ApiError", async () => {
    vi.spyOn(queries, "createJob").mockRejectedValue(
      new ApiError({ code: "MODEL_NOT_INSTALLED", message: "Il modello non è installato.", status: 409 }),
    );
    renderEditPage();
    await uploadSourceImage();

    await userEvent.click(screen.getByRole("tab", { name: "Allarga l'immagine" }));
    await userEvent.click(screen.getByRole("button", { name: "Sopra" }));
    await userEvent.click(screen.getByRole("button", { name: "Genera" }));

    expect(await screen.findByText("Il modello non è installato.")).toBeInTheDocument();
  });

  it("shows an upload error and leaves Riprova a no-op without an image", async () => {
    vi.spyOn(queries, "uploadFile").mockRejectedValue(new Error("too big"));
    const createJobSpy = vi.spyOn(queries, "createJob");
    renderEditPage();

    const file = new File(["fake-image-bytes"], "huge.png", { type: "image/png" });
    await userEvent.upload(screen.getByLabelText("Scegli un'immagine da modificare"), file);

    // Both the inline upload alert and the ResultArea error panel show the
    // same Italian message (SPEC.md § 11.3: prompt and parameters preserved).
    await waitFor(() =>
      expect(
        screen.getAllByText("Impossibile caricare l'immagine. Verifica formato e dimensione."),
      ).toHaveLength(2),
    );

    await userEvent.click(screen.getByRole("button", { name: "Riprova" }));
    expect(createJobSpy).not.toHaveBeenCalled();
  });

  it("requires a non-empty prompt before submitting an inpaint job", async () => {
    const createJobSpy = vi.spyOn(queries, "createJob");
    renderEditPage();
    await uploadSourceImage();
    await paintMaskStroke();

    await userEvent.click(screen.getByRole("button", { name: "Genera" }));

    expect(
      await screen.findByText("Descrivi cosa deve apparire nella zona scelta."),
    ).toBeInTheDocument();
    expect(createJobSpy).not.toHaveBeenCalled();
  });

  it("rejects an outpaint prompt longer than 2000 characters", async () => {
    const createJobSpy = vi.spyOn(queries, "createJob");
    renderEditPage();
    await uploadSourceImage();

    await userEvent.click(screen.getByRole("tab", { name: "Allarga l'immagine" }));
    await userEvent.click(screen.getByRole("button", { name: "Sopra" }));
    fireEvent.change(screen.getByLabelText("Descrizione"), { target: { value: "a".repeat(2001) } });

    await userEvent.click(screen.getByRole("button", { name: "Genera" }));

    expect(
      await screen.findByText("Il prompt supera i 2000 caratteri."),
    ).toBeInTheDocument();
    expect(createJobSpy).not.toHaveBeenCalled();
  });

  it("shows a mask-preparation error when exporting the mask fails, without submitting", async () => {
    vi.spyOn(maskExportLib, "exportMaskPng").mockRejectedValue(new Error("canvas unavailable"));
    const createJobSpy = vi.spyOn(queries, "createJob");
    renderEditPage();
    await uploadSourceImage();
    await paintMaskStroke();
    await userEvent.type(screen.getByLabelText("Descrizione"), "fix the torn sail");

    await userEvent.click(screen.getByRole("button", { name: "Genera" }));

    expect(
      await screen.findByText("Impossibile preparare la maschera. Riprova."),
    ).toBeInTheDocument();
    expect(createJobSpy).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Genera" })).toBeEnabled();
  });

  it("re-disables Genera after clearing the mask, so Riprova does not resubmit", async () => {
    vi.spyOn(maskExportLib, "exportMaskPng").mockResolvedValue(
      new Blob(["fake-mask-png"], { type: "image/png" }),
    );
    const createJobSpy = vi
      .spyOn(queries, "createJob")
      .mockResolvedValue({ job_id: "job-will-fail" });

    renderEditPage();
    await uploadSourceImage();
    await paintMaskStroke();
    await userEvent.type(screen.getByLabelText("Descrizione"), "fix the torn sail");
    await userEvent.click(screen.getByRole("button", { name: "Genera" }));

    const source = await waitFor(() => latestEventSource());
    source.emit("failed", { code: "OUT_OF_MEMORY", message: "Memoria della GPU esaurita." });
    await screen.findByText("Memoria della GPU esaurita.");
    expect(createJobSpy).toHaveBeenCalledTimes(1);

    await userEvent.click(screen.getByRole("button", { name: "Cancella tutto" }));
    expect(
      await screen.findByText("Disegna la zona da modificare prima di generare."),
    ).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Riprova" }));
    expect(createJobSpy).toHaveBeenCalledTimes(1);
  });

  it("shows the catalog's unavailable reason and keeps Genera disabled", async () => {
    vi.spyOn(queries, "fetchTasks").mockResolvedValue([
      buildTask({
        id: "inpaint",
        group: "modifica",
        label: "Modifica una parte",
        available: false,
        unavailable_reason: "Il modello di inpaint non è installato.",
      }),
      buildTask({ id: "outpaint", group: "modifica", label: "Allarga l'immagine" }),
    ]);
    renderEditPage();

    expect(
      await screen.findByText("Il modello di inpaint non è installato."),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Genera" })).toBeDisabled();
  });

  it("shows the step progress and a disabled running-label button while the job is running", async () => {
    vi.spyOn(queries, "createJob").mockResolvedValue({ job_id: "job-running" });
    renderEditPage();
    await uploadSourceImage();

    await userEvent.click(screen.getByRole("tab", { name: "Allarga l'immagine" }));
    await userEvent.click(screen.getByRole("button", { name: "Sopra" }));
    await userEvent.click(screen.getByRole("button", { name: "Genera" }));

    const source = await waitFor(() => latestEventSource());
    source.emit("progress", { step: 3, total: 20 });

    await waitFor(() => expect(screen.getByText("Passo 3 di 20.")).toBeInTheDocument());
    expect(screen.getByRole("button", { name: "Generazione in corso..." })).toBeDisabled();
  });

  it("shows the live preview sent by the engine while the job is running", async () => {
    // jsdom never loads image resources, so the preloader's onload must be simulated.
    vi.stubGlobal(
      "Image",
      class {
        onload: (() => void) | null = null;
        set src(_value: string) {
          queueMicrotask(() => this.onload?.());
        }
      },
    );
    vi.spyOn(queries, "createJob").mockResolvedValue({ job_id: "job-preview" });
    renderEditPage();
    await uploadSourceImage();
    await userEvent.click(screen.getByRole("tab", { name: "Allarga l'immagine" }));
    await userEvent.click(screen.getByRole("button", { name: "Sopra" }));
    await userEvent.click(screen.getByRole("button", { name: "Genera" }));
    const source = await waitFor(() => latestEventSource());
    expect(screen.queryByAltText("Anteprima in corso")).not.toBeInTheDocument();

    source.emit("progress", { step: 1, total: 20 });
    source.emit("preview", { url: "/api/v1/jobs/job-preview/preview?n=1" });

    const preview = await screen.findByAltText("Anteprima in corso");
    expect(preview).toHaveAttribute("src", "/api/v1/jobs/job-preview/preview?n=1");
    vi.unstubAllGlobals();
  });
});

function freeEditTask(overrides: Partial<Task> = {}): Task {
  return buildTask({
    id: "modifica_libera",
    group: "modifica",
    label: "Modifica con le parole",
    family: "flux2_klein",
    supports_negative: false,
    prompt_language: { required: "any", label: "Italiano o inglese", reason: "Capisce bene anche l'italiano." },
    defaults: { steps: 4, cfg: 1 },
    limits: { steps: { min: 4, max: 8 }, cfg: { min: 1, max: 1.5 } },
    ...overrides,
  });
}

describe("EditPage - modifica con le parole", () => {
  beforeEach(() => {
    installMockEventSource();
    vi.spyOn(queries, "uploadFile").mockResolvedValue({
      upload_id: "upload-image-1",
      width: IMAGE_WIDTH,
      height: IMAGE_HEIGHT,
    });
    globalThis.URL.createObjectURL = vi.fn(() => "blob:preview");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows the free-edit tab first and lets the user switch to it", async () => {
    vi.spyOn(queries, "fetchTasks").mockResolvedValue([
      freeEditTask(),
      buildTask({ id: "inpaint", group: "modifica", label: "Modifica una parte" }),
      buildTask({ id: "outpaint", group: "modifica", label: "Allarga l'immagine" }),
    ]);
    renderEditPage();

    const tabs = await screen.findAllByRole("tab");
    expect(tabs[0]).toHaveAccessibleName("Modifica con le parole");
    expect(screen.getByRole("tab", { name: "Modifica una parte" })).toHaveAttribute("aria-selected", "true");
  });

  it("requires a prompt and sends seed/steps/cfg, with no mask or directions", async () => {
    vi.spyOn(queries, "fetchTasks").mockResolvedValue([
      freeEditTask(),
      buildTask({ id: "inpaint", group: "modifica", label: "Modifica una parte" }),
      buildTask({ id: "outpaint", group: "modifica", label: "Allarga l'immagine" }),
    ]);
    const createJobSpy = vi.spyOn(queries, "createJob").mockResolvedValue({ job_id: "job-free-edit" });
    renderEditPage();
    await uploadSourceImage();

    await userEvent.click(screen.getByRole("tab", { name: "Modifica con le parole" }));
    expect(document.querySelector("canvas")).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Genera" }));
    expect(
      await screen.findByText("Descrivi il cambiamento da applicare all'immagine."),
    ).toBeInTheDocument();
    expect(createJobSpy).not.toHaveBeenCalled();

    await userEvent.type(screen.getByLabelText("Descrizione"), "metti il cielo al tramonto");
    await userEvent.click(screen.getByRole("button", { name: "Genera" }));

    await waitFor(() => expect(createJobSpy).toHaveBeenCalledTimes(1));
    const body = createJobSpy.mock.calls[0]?.[0];
    expect(body).toEqual(
      expect.objectContaining({
        task_id: "modifica_libera",
        prompt: "metti il cielo al tramonto",
        input_upload_id: "upload-image-1",
        params: expect.objectContaining({ seed: null, steps: null, cfg: null }),
      }),
    );
    expect(body).not.toHaveProperty("mask_upload_id");
    expect(body).not.toHaveProperty("outpaint_directions");
  });

  it("disables the free-edit tab's task with the catalog reason when unavailable", async () => {
    vi.spyOn(queries, "fetchTasks").mockResolvedValue([
      freeEditTask({ available: false, unavailable_reason: "Il modello non è installato." }),
      buildTask({ id: "inpaint", group: "modifica", label: "Modifica una parte" }),
      buildTask({ id: "outpaint", group: "modifica", label: "Allarga l'immagine" }),
    ]);
    renderEditPage();
    await uploadSourceImage();
    await userEvent.click(screen.getByRole("tab", { name: "Modifica con le parole" }));

    expect(await screen.findByText("Il modello non è installato.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Genera" })).toBeDisabled();
  });
});
