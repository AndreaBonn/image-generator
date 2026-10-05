import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { CreatePage } from "@/pages/CreatePage";
import * as queries from "@/api/queries";
import { ApiError } from "@/api/errors";
import { buildTask } from "../fixtures/task";
import { installMockEventSource, latestEventSource } from "../mocks/mockEventSource";

function renderCreatePage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <CreatePage />
    </QueryClientProvider>,
  );
}

describe("CreatePage recipe import", () => {
  beforeEach(() => {
    installMockEventSource();
    vi.spyOn(queries, "fetchTasks").mockResolvedValue([
      buildTask({ id: "bozza", label: "Bozza veloce" }),
      buildTask(),
    ]);
    vi.spyOn(queries, "fetchStyles").mockResolvedValue([]);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("applies the imported prompt, task and seed from an uploaded recipe", async () => {
    const uploadFile = vi.spyOn(queries, "uploadFile").mockResolvedValue({
      upload_id: "up-recipe",
      width: 1024,
      height: 1024,
      recipe: {
        task_id: "qualita",
        prompt: "a lighthouse at dusk",
        negative_prompt: "blur",
        params: { aspect_ratio: "1024*1024", seed: 12345, style_ids: [], steps: 30, cfg: 4 },
      },
    });
    renderCreatePage();

    await waitFor(() =>
      expect(screen.getByRole("button", { name: /^Bozza veloce/ })).toHaveAttribute("aria-pressed", "true"),
    );
    const file = new File(["png"], "recipe.png", { type: "image/png" });
    await userEvent.upload(screen.getByLabelText("Importa da immagine"), file);

    await waitFor(() => expect(screen.getByLabelText("Descrizione")).toHaveValue("a lighthouse at dusk"));
    expect(uploadFile).toHaveBeenCalledWith(file, "image");
    expect(screen.getByRole("button", { name: /^Immagine di qualità/ })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByLabelText("Seed")).toHaveValue(12345);
  });
});

describe("CreatePage generation error", () => {
  beforeEach(() => {
    installMockEventSource();
    vi.spyOn(queries, "fetchTasks").mockResolvedValue([buildTask()]);
    vi.spyOn(queries, "fetchStyles").mockResolvedValue([]);
  });

  it("keeps the prompt and shows the Italian error message when the job fails", async () => {
    vi.spyOn(queries, "createJob").mockResolvedValue({ job_id: "job-1" });

    renderCreatePage();

    const textarea = await screen.findByLabelText("Descrizione");
    await userEvent.type(textarea, "portrait of an old fisherman");
    await userEvent.click(screen.getByRole("button", { name: "Genera" }));

    const source = await waitFor(() => latestEventSource());
    source.emit("failed", {
      code: "ENGINE_UNAVAILABLE",
      message: "Il motore non risponde. Avvialo con scripts/start.sh.",
    });

    await waitFor(() =>
      expect(
        screen.getByText("Il motore non risponde. Avvialo con scripts/start.sh."),
      ).toBeInTheDocument(),
    );
    expect(textarea).toHaveValue("portrait of an old fisherman");
  });
});

describe("CreatePage job lifecycle", () => {
  beforeEach(() => {
    installMockEventSource();
    vi.spyOn(queries, "fetchTasks").mockResolvedValue([buildTask()]);
    vi.spyOn(queries, "fetchStyles").mockResolvedValue([]);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  async function submitPrompt(text = "portrait of an old fisherman") {
    renderCreatePage();
    const textarea = await screen.findByLabelText("Descrizione");
    await userEvent.type(textarea, text);
    await userEvent.click(screen.getByRole("button", { name: "Genera" }));
    return textarea;
  }

  it("renders the generated images once the job completes", async () => {
    vi.spyOn(queries, "createJob").mockResolvedValue({ job_id: "job-done" });
    await submitPrompt();

    const source = await waitFor(() => latestEventSource());
    source.emit("completed", { generation_ids: ["gen-1", "gen-2"] });

    await waitFor(() => expect(screen.getAllByAltText("Immagine generata")).toHaveLength(2));
    expect(screen.getByRole("button", { name: "Genera" })).toBeEnabled();
  });

  it("re-enables Genera when the server reports the job as cancelled", async () => {
    vi.spyOn(queries, "createJob").mockResolvedValue({ job_id: "job-server-cancel" });
    await submitPrompt();

    const source = await waitFor(() => latestEventSource());
    source.emit("cancelled", {});

    await waitFor(() => expect(screen.getByRole("button", { name: "Genera" })).toBeEnabled());
  });

  it("cancels the running job and re-enables Genera when Annulla is clicked", async () => {
    vi.spyOn(queries, "createJob").mockResolvedValue({ job_id: "job-cancel" });
    const cancelSpy = vi.spyOn(queries, "cancelJob").mockResolvedValue(undefined);
    await submitPrompt();

    await screen.findByRole("button", { name: "Annulla" });
    await userEvent.click(screen.getByRole("button", { name: "Annulla" }));

    await waitFor(() => expect(cancelSpy).toHaveBeenCalled());
    expect(cancelSpy.mock.calls[0]?.[0]).toBe("job-cancel");
    await waitFor(() => expect(screen.getByRole("button", { name: "Genera" })).toBeEnabled());
  });

  it("shows a generic Italian message when job creation fails with a non-API error", async () => {
    vi.spyOn(queries, "createJob").mockRejectedValue(new Error("network down"));
    await submitPrompt();

    expect(
      await screen.findByText("Si è verificato un errore imprevisto."),
    ).toBeInTheDocument();
  });

  it("shows the API error's own Italian message when job creation fails with an ApiError", async () => {
    vi.spyOn(queries, "createJob").mockRejectedValue(
      new ApiError({ code: "MODEL_NOT_INSTALLED", message: "Il modello non è installato.", status: 409 }),
    );
    await submitPrompt();

    expect(await screen.findByText("Il modello non è installato.")).toBeInTheDocument();
  });

  it("shows the step progress and a disabled running-label button while the job is running", async () => {
    vi.spyOn(queries, "createJob").mockResolvedValue({ job_id: "job-running" });
    await submitPrompt();

    const source = await waitFor(() => latestEventSource());
    source.emit("progress", { step: 5, total: 30 });

    await waitFor(() => expect(screen.getByText("Passo 5 di 30.")).toBeInTheDocument());
    expect(screen.getByRole("button", { name: "Generazione in corso..." })).toBeDisabled();
  });
});

describe("CreatePage validation and task list", () => {
  beforeEach(() => {
    installMockEventSource();
    vi.spyOn(queries, "fetchStyles").mockResolvedValue([]);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("blocks submission with an empty prompt and never calls createJob", async () => {
    vi.spyOn(queries, "fetchTasks").mockResolvedValue([buildTask()]);
    const createJobSpy = vi.spyOn(queries, "createJob");
    renderCreatePage();

    await screen.findByRole("button", { name: "Genera" });
    await userEvent.click(screen.getByRole("button", { name: "Genera" }));

    expect(
      await screen.findByText("Scrivi una descrizione prima di generare."),
    ).toBeInTheDocument();
    expect(createJobSpy).not.toHaveBeenCalled();
  });

  it("blocks submission when the prompt exceeds 2000 characters", async () => {
    vi.spyOn(queries, "fetchTasks").mockResolvedValue([buildTask()]);
    const createJobSpy = vi.spyOn(queries, "createJob");
    renderCreatePage();

    const textarea = await screen.findByLabelText("Descrizione");
    fireEvent.change(textarea, { target: { value: "a".repeat(2001) } });
    await userEvent.click(screen.getByRole("button", { name: "Genera" }));

    expect(
      await screen.findByText("Il prompt supera i 2000 caratteri."),
    ).toBeInTheDocument();
    expect(createJobSpy).not.toHaveBeenCalled();
  });

  it("shows a retry action when the task catalog fails to load, and refetches on click", async () => {
    const fetchTasksSpy = vi
      .spyOn(queries, "fetchTasks")
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValueOnce([buildTask()]);
    renderCreatePage();

    expect(await screen.findByText("Impossibile caricare i compiti.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Riprova" }));

    await waitFor(() => expect(fetchTasksSpy).toHaveBeenCalledTimes(2));
    await screen.findByLabelText("Descrizione");
  });

  it("shows a message when the catalog has no creation tasks", async () => {
    vi.spyOn(queries, "fetchTasks").mockResolvedValue([
      buildTask({ id: "inpaint", group: "modifica" }),
    ]);
    renderCreatePage();

    expect(
      await screen.findByText("Nessun compito di creazione disponibile."),
    ).toBeInTheDocument();
  });

  it("selects no task and hides the prompt form when every creation task is unavailable", async () => {
    vi.spyOn(queries, "fetchTasks").mockResolvedValue([
      buildTask({ available: false, unavailable_reason: "Modello non installato." }),
    ]);
    renderCreatePage();

    const reason = await screen.findByText("Modello non installato.");

    expect({
      reasonShown: reason.isConnected,
      promptShown: screen.queryByLabelText("Descrizione") !== null,
    }).toEqual({ reasonShown: true, promptShown: false });
  });

  it("switches the selected task card, resetting its aspect ratio and styles", async () => {
    vi.spyOn(queries, "fetchTasks").mockResolvedValue([
      buildTask({
        id: "bozza",
        label: "Bozza veloce",
        default_aspect_ratio: "1152*896",
        default_styles: [],
      }),
      buildTask({
        id: "qualita",
        label: "Immagine di qualità",
        default_aspect_ratio: "1024*1024",
        default_styles: ["Fooocus Enhance"],
        aspect_ratios: [
          { value: "1152*896", width: 1152, height: 896, label: "Orizzontale 4:3 · 1152×896", featured: true },
          { value: "1024*1024", width: 1024, height: 1024, label: "Quadrato 1:1 · 1024×1024", featured: true },
        ],
      }),
    ]);
    renderCreatePage();

    // The effect auto-selects the first available task ("Bozza veloce"). Task
    // cards include the description text in their accessible name, so match
    // on the label as a substring rather than the full (longer) name.
    await screen.findByRole("button", { name: /^Bozza veloce/ });
    expect(screen.getByRole("button", { name: "Orizzontale 4:3 · 1152×896" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    await userEvent.click(screen.getByRole("button", { name: /^Immagine di qualità/ }));

    expect(screen.getByRole("button", { name: /^Immagine di qualità/ })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: "Quadrato 1:1 · 1024×1024" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("hides the style selector for tasks that don't support styles", async () => {
    vi.spyOn(queries, "fetchTasks").mockResolvedValue([buildTask({ supports_styles: false })]);
    renderCreatePage();

    await screen.findByLabelText("Descrizione");
    expect(screen.queryByText(/Stili \(massimo/)).not.toBeInTheDocument();
  });

  it("clamps the batch count to the 1-4 range and sends the clamped value", async () => {
    vi.spyOn(queries, "fetchTasks").mockResolvedValue([buildTask()]);
    const createJobSpy = vi.spyOn(queries, "createJob").mockResolvedValue({ job_id: "job-batch" });
    renderCreatePage();

    const batchInput = await screen.findByLabelText("Numero di immagini");
    fireEvent.change(batchInput, { target: { value: "10" } });
    expect(batchInput).toHaveValue(4);

    fireEvent.change(batchInput, { target: { value: "0" } });
    expect(batchInput).toHaveValue(1);

    fireEvent.change(batchInput, { target: { value: "3" } });
    expect(batchInput).toHaveValue(3);

    await userEvent.type(screen.getByLabelText("Descrizione"), "a cozy reading corner");
    await userEvent.click(screen.getByRole("button", { name: "Genera" }));

    await waitFor(() => expect(createJobSpy).toHaveBeenCalledTimes(1));
    expect(createJobSpy.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({ params: expect.objectContaining({ batch: 3 }) }),
    );
  });
});
