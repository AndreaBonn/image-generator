import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { EditPage } from "@/pages/EditPage";
import * as queries from "@/api/queries";
import * as maskExportLib from "@/lib/maskExport";
import { buildTask } from "../fixtures/task";
import { installMockEventSource } from "../mocks/mockEventSource";

const IMAGE_WIDTH = 200;
const IMAGE_HEIGHT = 150;

function renderEditPage() {
  const client = new QueryClient();
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/modifica"]}>
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

    const canvas = document.querySelector("canvas");
    if (!canvas) throw new Error("mask canvas not found");
    await userEvent.pointer([
      { target: canvas, coords: { clientX: 100, clientY: 75 } },
      { keys: "[MouseLeft]", target: canvas, coords: { clientX: 100, clientY: 75 } },
    ]);

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
});
