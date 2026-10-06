import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SketchPad } from "@/components/create/SketchPad";
import * as queries from "@/api/queries";
import type { ReferenceItem } from "@/components/create/ReferencePicker";

const SIZE = 1024;

function renderSketchPad(onReferenceCreated = vi.fn<(item: ReferenceItem) => void>()) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <SketchPad onReferenceCreated={onReferenceCreated} />
    </QueryClientProvider>,
  );
  return onReferenceCreated;
}

function canvas() {
  const node = document.querySelector("canvas");
  if (!node) throw new Error("sketch canvas not found");
  return node;
}

/** jsdom has no `ImageData` constructor; a plain data holder is enough since
 * nothing here reads back the pixels it wraps (same pattern as MaskEditor's tests). */
class FakeImageData {
  data: Uint8ClampedArray;
  width: number;
  height: number;
  constructor(data: Uint8ClampedArray, width: number, height: number) {
    this.data = data;
    this.width = width;
    this.height = height;
  }
}

describe("SketchPad", () => {
  let originalGetBoundingClientRect: typeof Element.prototype.getBoundingClientRect;
  let putImageData: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.stubGlobal("ImageData", FakeImageData);
    putImageData = vi.fn();
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
      putImageData,
    } as unknown as CanvasRenderingContext2D);
    HTMLCanvasElement.prototype.toBlob = vi.fn(function (callback: BlobCallback) {
      callback(new Blob(["png-bytes"], { type: "image/png" }));
    }) as unknown as typeof HTMLCanvasElement.prototype.toBlob;

    originalGetBoundingClientRect = Element.prototype.getBoundingClientRect;
    Element.prototype.getBoundingClientRect = vi.fn(
      () =>
        ({
          width: SIZE,
          height: SIZE,
          top: 0,
          left: 0,
          right: SIZE,
          bottom: SIZE,
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
    vi.unstubAllGlobals();
  });

  async function drag(from: { x: number; y: number }, to: { x: number; y: number }) {
    await userEvent.pointer([
      { keys: "[MouseLeft>]", target: canvas(), coords: { clientX: from.x, clientY: from.y } },
      { target: canvas(), coords: { clientX: to.x, clientY: to.y } },
      { keys: "[/MouseLeft]", target: canvas() },
    ]);
  }

  it("renders a white canvas with brush, eraser and the 3 thickness options", () => {
    renderSketchPad(vi.fn());

    expect(canvas()).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Pennello" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Gomma" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("button", { name: "Fine" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Medio" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Spesso" })).toBeInTheDocument();
    expect(putImageData).toHaveBeenCalledTimes(1);
  });

  it("disables \"Usa come schizzo\" on an empty canvas and enables it once something is drawn", async () => {
    renderSketchPad(vi.fn());
    expect(screen.getByRole("button", { name: "Usa come schizzo" })).toBeDisabled();

    await drag({ x: 50, y: 50 }, { x: 120, y: 50 });

    expect(screen.getByRole("button", { name: "Usa come schizzo" })).toBeEnabled();
  });

  it("reports an unsaved drawing to the parent, and its clearing", async () => {
    const onDirtyChange = vi.fn<(dirty: boolean) => void>();
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <SketchPad onReferenceCreated={vi.fn()} onDirtyChange={onDirtyChange} />
      </QueryClientProvider>,
    );
    expect(onDirtyChange).toHaveBeenLastCalledWith(false);

    await drag({ x: 50, y: 50 }, { x: 120, y: 50 });
    expect(onDirtyChange).toHaveBeenLastCalledWith(true);

    await userEvent.click(screen.getByRole("button", { name: "Cancella tutto" }));
    expect(onDirtyChange).toHaveBeenLastCalledWith(false);
  });

  it("erases with the Gomma tool instead of drawing", async () => {
    renderSketchPad(vi.fn());
    await drag({ x: 50, y: 50 }, { x: 120, y: 50 });
    expect(screen.getByRole("button", { name: "Usa come schizzo" })).toBeEnabled();

    await userEvent.click(screen.getByRole("button", { name: "Gomma" }));
    await drag({ x: 50, y: 50 }, { x: 120, y: 50 });

    expect(screen.getByRole("button", { name: "Usa come schizzo" })).toBeDisabled();
  });

  it("undoes a stroke and clears the whole drawing", async () => {
    renderSketchPad(vi.fn());
    await drag({ x: 50, y: 50 }, { x: 120, y: 50 });

    await userEvent.click(screen.getByRole("button", { name: "Annulla" }));
    expect(screen.getByRole("button", { name: "Usa come schizzo" })).toBeDisabled();

    await drag({ x: 50, y: 50 }, { x: 120, y: 50 });
    expect(screen.getByRole("button", { name: "Usa come schizzo" })).toBeEnabled();

    await userEvent.click(screen.getByRole("button", { name: "Cancella tutto" }));
    expect(screen.getByRole("button", { name: "Usa come schizzo" })).toBeDisabled();
  });

  it("exports the drawing as a PNG, uploads it and hands a ReferenceItem back", async () => {
    const uploadFile = vi
      .spyOn(queries, "uploadFile")
      .mockResolvedValue({ upload_id: "up-sketch", width: SIZE, height: SIZE });
    const onReferenceCreated = vi.fn<(item: ReferenceItem) => void>();
    renderSketchPad(onReferenceCreated);

    await drag({ x: 50, y: 50 }, { x: 120, y: 50 });
    await userEvent.click(screen.getByRole("button", { name: "Usa come schizzo" }));

    await waitFor(() => expect(onReferenceCreated).toHaveBeenCalledTimes(1));
    expect(uploadFile).toHaveBeenCalledTimes(1);
    const [file, kind] = uploadFile.mock.calls[0] as [File, string];
    expect(file.type).toBe("image/png");
    expect(kind).toBe("image");
    expect(onReferenceCreated.mock.calls[0]?.[0]?.input).toEqual({ upload_id: "up-sketch" });

    // The canvas resets for a possible second sketch once the upload lands.
    await waitFor(() => expect(screen.getByRole("button", { name: "Usa come schizzo" })).toBeDisabled());
  });

  it("shows an Italian error when the upload fails", async () => {
    vi.spyOn(queries, "uploadFile").mockRejectedValue(new Error("boom"));
    renderSketchPad(vi.fn());

    await drag({ x: 50, y: 50 }, { x: 120, y: 50 });
    await userEvent.click(screen.getByRole("button", { name: "Usa come schizzo" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Impossibile caricare lo schizzo. Verifica la connessione e riprova.",
    );
  });
});
