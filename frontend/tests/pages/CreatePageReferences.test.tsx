import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import * as queries from "@/api/queries";
import { buildTask } from "../fixtures/task";
import { renderCreatePage } from "../fixtures/createPage";
import { installMockEventSource } from "../mocks/mockEventSource";

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

    await waitFor(() => expect(screen.getByLabelText("Descrivi l'immagine che vuoi")).toHaveValue("a lighthouse at dusk"));
    expect(uploadFile).toHaveBeenCalledWith(file, "image");
    expect(screen.getByRole("button", { name: /^Immagine di qualità/ })).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(screen.getByRole("button", { name: /Opzioni avanzate/ }));
    expect(screen.getByLabelText("Codice del risultato")).toHaveValue(12345);
  });
});

describe("CreatePage crea_da_riferimenti", () => {
  beforeEach(() => {
    installMockEventSource();
    vi.spyOn(queries, "fetchTasks").mockResolvedValue([
      buildTask({
        id: "crea_da_riferimenti",
        label: "Crea dai riferimenti",
        min_references: 1,
        max_references: 3,
      }),
    ]);
    vi.spyOn(queries, "fetchStyles").mockResolvedValue([]);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows the reference picker and disables Genera with a reason until one is added", async () => {
    vi.spyOn(queries, "uploadFile").mockResolvedValue({ upload_id: "up-ref", width: 1024, height: 1024 });
    renderCreatePage();

    await userEvent.type(await screen.findByLabelText("Descrivi l'immagine che vuoi"), "a cafe in Paris, morning light");
    expect(screen.getByText("0 di 3")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Genera" })).toBeDisabled();
    expect(
      screen.getByText("Aggiungi almeno un'immagine di riferimento per generare."),
    ).toBeInTheDocument();

    const file = new File(["bytes"], "ref.png", { type: "image/png" });
    await userEvent.upload(screen.getByLabelText("Aggiungi riferimento da file"), file);

    await waitFor(() => expect(screen.getByText("1 di 3")).toBeInTheDocument());
    expect(screen.getByRole("button", { name: "Genera" })).toBeEnabled();
  });

  it("sends the picked references in the job body", async () => {
    vi.spyOn(queries, "uploadFile").mockResolvedValue({ upload_id: "up-ref", width: 1024, height: 1024 });
    const createJobSpy = vi.spyOn(queries, "createJob").mockResolvedValue({ job_id: "job-refs" });
    renderCreatePage();

    await userEvent.type(await screen.findByLabelText("Descrivi l'immagine che vuoi"), "a cafe in Paris, morning light");
    await userEvent.upload(
      screen.getByLabelText("Aggiungi riferimento da file"),
      new File(["bytes"], "ref.png", { type: "image/png" }),
    );
    await waitFor(() => expect(screen.getByRole("button", { name: "Genera" })).toBeEnabled());
    await userEvent.click(screen.getByRole("button", { name: "Genera" }));

    await waitFor(() => expect(createJobSpy).toHaveBeenCalledTimes(1));
    expect(createJobSpy.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({ references: [{ upload_id: "up-ref" }] }),
    );
  });
});

describe("CreatePage recipe import resets references", () => {
  beforeEach(() => {
    installMockEventSource();
    vi.spyOn(queries, "fetchTasks").mockResolvedValue([
      buildTask({ id: "bozza", label: "Bozza veloce" }),
      buildTask({
        id: "crea_da_riferimenti",
        label: "Crea dai riferimenti",
        min_references: 1,
        max_references: 3,
      }),
    ]);
    vi.spyOn(queries, "fetchStyles").mockResolvedValue([]);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("warns that references must be chosen again when a recipe switches to crea_da_riferimenti", async () => {
    vi.spyOn(queries, "uploadFile").mockResolvedValue({
      upload_id: "up-recipe",
      width: 1024,
      height: 1024,
      recipe: {
        task_id: "crea_da_riferimenti",
        prompt: "a character on a cliff at sunset",
        negative_prompt: "",
        params: { aspect_ratio: "1152*896", seed: 7, style_ids: [], steps: 4, cfg: 1 },
      },
    });
    renderCreatePage();

    await waitFor(() =>
      expect(screen.getByRole("button", { name: /^Bozza veloce/ })).toHaveAttribute("aria-pressed", "true"),
    );
    const file = new File(["png"], "recipe.png", { type: "image/png" });
    await userEvent.upload(screen.getByLabelText("Importa da immagine"), file);

    await waitFor(() =>
      expect(screen.getByText("Scegli di nuovo le immagini di riferimento.")).toBeInTheDocument(),
    );
    expect(screen.getByText("0 di 3")).toBeInTheDocument();
  });
});
