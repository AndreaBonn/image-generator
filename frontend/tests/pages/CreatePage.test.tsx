import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { screen, waitFor, fireEvent, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import * as queries from "@/api/queries";
import { buildTask } from "../fixtures/task";
import { renderCreatePage } from "../fixtures/createPage";
import { installMockEventSource } from "../mocks/mockEventSource";

describe("CreatePage validation and task list", () => {
  beforeEach(() => {
    installMockEventSource();
    vi.spyOn(queries, "fetchStyles").mockResolvedValue([]);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    window.sessionStorage.clear();
  });

  it("puts a larger description field before the examples (C5)", async () => {
    vi.spyOn(queries, "fetchTasks").mockResolvedValue([
      buildTask({ prompt_examples: ["portrait of an old fisherman, golden hour"] }),
    ]);
    renderCreatePage();

    const textarea = await screen.findByLabelText("Descrivi l'immagine che vuoi");
    const example = screen.getByRole("button", { name: "portrait of an old fisherman, golden hour" });
    expect(textarea).toHaveAttribute("rows", "5");
    expect(textarea.compareDocumentPosition(example) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("keeps the description when the user leaves Crea and comes back (C16)", async () => {
    vi.spyOn(queries, "fetchTasks").mockResolvedValue([buildTask()]);
    const first = renderCreatePage();
    await userEvent.type(await screen.findByLabelText("Descrivi l'immagine che vuoi"), "a red fox");
    first.unmount();

    renderCreatePage();

    const textarea = await screen.findByLabelText("Descrivi l'immagine che vuoi");
    await waitFor(() => expect(textarea).toHaveValue("a red fox"));
    expect(screen.getByText("Ripresa da dove avevi lasciato.")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Svuota la descrizione" }));
    expect(textarea).toHaveValue("");
    expect(screen.queryByText("Ripresa da dove avevi lasciato.")).not.toBeInTheDocument();
  });

  it("falls back to an available task when the restored one is no longer available (R1)", async () => {
    window.sessionStorage.setItem(
      "image-generator-create-draft-v1",
      JSON.stringify({
        taskId: "foto", prompt: "", negativePrompt: "", aspectRatio: "", batch: 1, styleIds: [],
        seed: null, seedLocked: false, steps: null, cfg: null,
      }),
    );
    vi.spyOn(queries, "fetchTasks").mockResolvedValue([
      buildTask({ id: "bozza", label: "Bozza veloce" }),
      buildTask({ id: "foto", label: "Foto realistica", available: false, unavailable_reason: "Manca il modello." }),
    ]);

    renderCreatePage();

    await waitFor(() =>
      expect(screen.getByRole("button", { name: /^Bozza veloce/ })).toHaveAttribute("aria-pressed", "true"),
    );
    expect(screen.getByRole("button", { name: /^Foto realistica/ })).toHaveAttribute("aria-pressed", "false");
  });

  it("keeps Genera in a sticky bar that sums up what will start (C2)", async () => {
    vi.spyOn(queries, "fetchTasks").mockResolvedValue([
      buildTask({ label: "Bozza veloce", duration_hint: "circa 4 s" }),
    ]);
    renderCreatePage();

    const generate = await screen.findByRole("button", { name: "Genera" });
    const bar = generate.parentElement;
    expect(bar).toHaveClass("sticky", "bottom-0");
    expect(generate).toHaveAccessibleDescription("Bozza veloce · 1 immagine · circa 4 s");

    const batchGroup = screen.getByRole("group", { name: "Numero di immagini" });
    await userEvent.click(within(batchGroup).getByRole("button", { name: "3" }));
    expect(generate).toHaveAccessibleDescription("Bozza veloce · 3 immagini · circa 4 s a immagine");
  });

  it("keeps the result code inside the advanced options (C12)", async () => {
    vi.spyOn(queries, "fetchTasks").mockResolvedValue([buildTask()]);
    renderCreatePage();

    await screen.findByRole("button", { name: "Genera" });
    expect(screen.queryByLabelText("Codice del risultato")).not.toBeInTheDocument();
    expect(screen.queryByText(/^Codice del risultato:/)).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /Opzioni avanzate/ }));
    expect(screen.getByLabelText("Codice del risultato")).toBeInTheDocument();
  });

  it("explains the number of images in plain text (S3)", async () => {
    vi.spyOn(queries, "fetchTasks").mockResolvedValue([buildTask()]);
    renderCreatePage();

    await screen.findByRole("button", { name: "Genera" });
    expect(screen.getByText("Più immagini danno più scelta, ma richiedono più tempo.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Informazioni: Numero di immagini" })).not.toBeInTheDocument();
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

    const textarea = await screen.findByLabelText("Descrivi l'immagine che vuoi");
    fireEvent.change(textarea, { target: { value: "a".repeat(2001) } });
    await userEvent.click(screen.getByRole("button", { name: "Genera" }));

    expect(
      await screen.findByText("La descrizione supera i 2000 caratteri."),
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
    await screen.findByLabelText("Descrivi l'immagine che vuoi");
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
      promptShown: screen.queryByLabelText("Descrivi l'immagine che vuoi") !== null,
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
    expect(screen.getByRole("button", { name: /Orizzontale 4:3/ })).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    await userEvent.click(screen.getByRole("button", { name: /^Immagine di qualità/ }));

    expect(screen.getByRole("button", { name: /^Immagine di qualità/ })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: /Quadrato 1:1/ })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("hides the style selector for tasks that don't support styles", async () => {
    vi.spyOn(queries, "fetchTasks").mockResolvedValue([buildTask({ supports_styles: false })]);
    renderCreatePage();

    await screen.findByLabelText("Descrivi l'immagine che vuoi");
    expect(screen.queryByRole("group", { name: /^Stili/ })).not.toBeInTheDocument();
  });

  it("offers the number of images as four buttons and sends the chosen one (C11)", async () => {
    vi.spyOn(queries, "fetchTasks").mockResolvedValue([buildTask()]);
    const createJobSpy = vi.spyOn(queries, "createJob").mockResolvedValue({ job_id: "job-batch" });
    renderCreatePage();

    const group = await screen.findByRole("group", { name: "Numero di immagini" });
    const buttons = within(group).getAllByRole("button");
    expect(buttons.map((button) => button.textContent)).toEqual(["1", "2", "3", "4"]);
    expect(within(group).getByRole("button", { name: "1" })).toHaveAttribute("aria-pressed", "true");

    await userEvent.click(within(group).getByRole("button", { name: "3" }));
    expect(within(group).getByRole("button", { name: "3" })).toHaveAttribute("aria-pressed", "true");
    expect(within(group).getByRole("button", { name: "1" })).toHaveAttribute("aria-pressed", "false");

    await userEvent.type(screen.getByLabelText("Descrivi l'immagine che vuoi"), "a cozy reading corner");
    await userEvent.click(screen.getByRole("button", { name: "Genera" }));

    await waitFor(() => expect(createJobSpy).toHaveBeenCalledTimes(1));
    expect(createJobSpy.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({ params: expect.objectContaining({ batch: 3 }) }),
    );
  });
});
