import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import * as queries from "@/api/queries";
import { ApiError } from "@/api/errors";
import { buildTask } from "../fixtures/task";
import { renderCreatePage } from "../fixtures/createPage";
import { installMockEventSource, latestEventSource } from "../mocks/mockEventSource";

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
      message: 'Il motore che crea le immagini non risponde: dal menu delle applicazioni scegli "Chiudi Image Generator" e poi riaprilo, oppure avvialo con scripts/start.sh.',
    });

    await waitFor(() =>
      expect(
        screen.getByText('Il motore che crea le immagini non risponde: dal menu delle applicazioni scegli "Chiudi Image Generator" e poi riaprilo, oppure avvialo con scripts/start.sh.'),
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
