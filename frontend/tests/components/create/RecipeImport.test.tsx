import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RecipeImport } from "@/components/create/RecipeImport";
import { ApiError } from "@/api/errors";
import * as queries from "@/api/queries";
import { buildTask } from "../../fixtures/task";
import type { RecipeImportPatch } from "@/lib/recipeImport";
import type { UploadRecipe } from "@/api/types";

const IMPORT_LABEL = "Riprendi le impostazioni da un'immagine creata qui";

function renderRecipeImport(onApply: (patch: RecipeImportPatch) => void) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <RecipeImport tasks={[buildTask()]} onApply={onApply}>
        <p>prompt area</p>
      </RecipeImport>
    </QueryClientProvider>,
  );
}

function buildRecipe(overrides: Partial<UploadRecipe> = {}): UploadRecipe {
  return {
    task_id: "qualita",
    prompt: "portrait of an old fisherman, golden hour",
    negative_prompt: "",
    params: {
      aspect_ratio: "1152*896",
      seed: 42,
      style_ids: [],
      steps: 30,
      cfg: 4,
    },
    ...overrides,
  };
}

async function uploadPng() {
  const file = new File(["fake-png-bytes"], "recipe.png", { type: "image/png" });
  await userEvent.upload(screen.getByLabelText("Importa da immagine"), file);
}

function dropZone() {
  // The prompt child sits directly inside the wrapper handling drag and drop.
  return screen.getByText("prompt area").parentElement as HTMLElement;
}

function dataTransferWith(file: File) {
  return { files: [file] } as unknown as DataTransfer;
}

describe("RecipeImport", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows the API error message in an alert when the upload fails", async () => {
    vi.spyOn(queries, "uploadFile").mockRejectedValue(new ApiError({
      code: "PAYLOAD_TOO_LARGE",
      message: "Immagine troppo grande.",
      status: 413,
    }));
    renderRecipeImport(vi.fn());

    await uploadPng();

    expect(await screen.findByRole("alert")).toHaveTextContent(/^Immagine troppo grande\.$/);
  });

  it("shows the fallback alert when the upload fails with a generic error", async () => {
    vi.spyOn(queries, "uploadFile").mockRejectedValue(new Error("network down"));
    renderRecipeImport(vi.fn());

    await uploadPng();

    expect(await screen.findByRole("alert")).toHaveTextContent(/^Impossibile leggere l'immagine\.$/);
  });

  it("offers the import as a plain-language link after the description area (C5)", () => {
    renderRecipeImport(vi.fn());

    const button = screen.getByRole("button", { name: IMPORT_LABEL });
    const promptArea = screen.getByText("prompt area");
    expect(promptArea.compareDocumentPosition(button) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^Informazioni/ })).not.toBeInTheDocument();
  });

  it("disables the import button and shows progress while the upload is pending", async () => {
    vi.spyOn(queries, "uploadFile").mockReturnValue(new Promise(() => {}));
    renderRecipeImport(vi.fn());
    expect(screen.getByRole("button", { name: IMPORT_LABEL })).toBeEnabled();

    await uploadPng();

    const button = await screen.findByRole("button", { name: "Importazione..." });
    expect(button).toBeDisabled();
  });

  it("imports settings from a valid PNG dropped on the prompt area", async () => {
    vi.spyOn(queries, "uploadFile").mockResolvedValue({
      upload_id: "upload-1", width: 1152, height: 896, recipe: buildRecipe(),
    });
    vi.spyOn(queries, "fetchStyles").mockResolvedValue([]);
    const onApply = vi.fn();
    renderRecipeImport(onApply);
    const file = new File(["fake-png-bytes"], "recipe.png", { type: "image/png" });

    fireEvent.drop(dropZone(), { dataTransfer: dataTransferWith(file) });

    expect(await screen.findByText("Impostazioni importate dall'immagine.")).toBeInTheDocument();
    expect(onApply).toHaveBeenCalledTimes(1);
    expect(onApply).toHaveBeenCalledWith(expect.objectContaining({
      taskId: "qualita", prompt: "portrait of an old fisherman, golden hour",
      seed: 42, aspectRatio: "1152*896",
    }));
  });

  it("highlights the prompt area on drag over and clears the highlight on drag leave", () => {
    renderRecipeImport(vi.fn());
    const zone = dropZone();

    fireEvent.dragOver(zone);

    expect(zone).toHaveClass("ring-2", "ring-accent");

    fireEvent.dragLeave(zone);

    expect(zone).not.toHaveClass("ring-2");
    expect(zone).not.toHaveClass("ring-accent");
  });

  it("uploads the PNG with kind=image via POST /api/v1/uploads", async () => {
    const uploadSpy = vi.spyOn(queries, "uploadFile").mockResolvedValue({
      upload_id: "upload-1",
      width: 1152,
      height: 896,
      recipe: null,
    });
    renderRecipeImport(vi.fn());

    await uploadPng();

    await waitFor(() => expect(uploadSpy).toHaveBeenCalledTimes(1));
    expect(uploadSpy.mock.calls[0]?.[0]).toBeInstanceOf(File);
    expect(uploadSpy.mock.calls[0]?.[1]).toBe("image");
  });

  it("fills the form via onApply when the uploaded image carries a valid recipe", async () => {
    vi.spyOn(queries, "uploadFile").mockResolvedValue({
      upload_id: "upload-1",
      width: 1152,
      height: 896,
      recipe: buildRecipe(),
    });
    vi.spyOn(queries, "fetchStyles").mockResolvedValue([]);
    const onApply = vi.fn();
    renderRecipeImport(onApply);

    await uploadPng();

    await waitFor(() => expect(onApply).toHaveBeenCalledTimes(1));
    expect(onApply).toHaveBeenCalledWith(
      expect.objectContaining({
        taskId: "qualita",
        prompt: "portrait of an old fisherman, golden hour",
        seed: 42,
        aspectRatio: "1152*896",
      }),
    );
    expect(await screen.findByText("Impostazioni importate dall'immagine.")).toBeInTheDocument();
  });

  it("shows the no-recipe message and does not call onApply when the image carries no recipe", async () => {
    vi.spyOn(queries, "uploadFile").mockResolvedValue({
      upload_id: "upload-1",
      width: 1152,
      height: 896,
      recipe: null,
    });
    const onApply = vi.fn();
    renderRecipeImport(onApply);

    await uploadPng();

    expect(
      await screen.findByText("Questa immagine non contiene impostazioni di Image Generator."),
    ).toBeInTheDocument();
    expect(onApply).not.toHaveBeenCalled();
  });

  it("never calls createJob on its own, even after a successful recipe import", async () => {
    vi.spyOn(queries, "uploadFile").mockResolvedValue({
      upload_id: "upload-1",
      width: 1152,
      height: 896,
      recipe: buildRecipe(),
    });
    vi.spyOn(queries, "fetchStyles").mockResolvedValue([]);
    const createJobSpy = vi.spyOn(queries, "createJob");
    renderRecipeImport(vi.fn());

    await uploadPng();
    await screen.findByText("Impostazioni importate dall'immagine.");

    expect(createJobSpy).not.toHaveBeenCalled();
  });
});
