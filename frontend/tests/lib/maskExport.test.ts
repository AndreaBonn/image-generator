import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { exportMaskPng } from "@/lib/maskExport";
import { maskToRgba } from "@/lib/mask";

/** Minimal stand-in: jsdom has no `ImageData` global at all. */
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

/**
 * jsdom has no real canvas backend (`HTMLCanvasElement.getContext` throws
 * "not implemented", `ImageData` isn't even defined), so only the canvas
 * boundary is stubbed here; the pixel computation itself (`maskToRgba`)
 * runs for real and is asserted against directly.
 */
describe("exportMaskPng", () => {
  const originalGetContext = HTMLCanvasElement.prototype.getContext;
  const originalToBlob = HTMLCanvasElement.prototype.toBlob;

  beforeEach(() => {
    vi.stubGlobal("ImageData", FakeImageData);
  });

  afterEach(() => {
    HTMLCanvasElement.prototype.getContext = originalGetContext;
    HTMLCanvasElement.prototype.toBlob = originalToBlob;
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("sizes the canvas to the mask resolution and paints the grayscale export at (0,0)", async () => {
    const putImageData = vi.fn();
    HTMLCanvasElement.prototype.getContext = vi.fn(
      () => ({ putImageData }) as unknown as CanvasRenderingContext2D,
    ) as unknown as typeof HTMLCanvasElement.prototype.getContext;

    const blob = new Blob(["png-bytes"], { type: "image/png" });
    HTMLCanvasElement.prototype.toBlob = vi.fn(function (
      this: HTMLCanvasElement,
      callback: BlobCallback,
    ) {
      expect(this.width).toBe(2);
      expect(this.height).toBe(2);
      callback(blob);
    }) as unknown as typeof HTMLCanvasElement.prototype.toBlob;

    const mask = Uint8Array.from([0, 255, 0, 255]);
    const result = await exportMaskPng(mask, 2, 2);

    expect(result).toBe(blob);
    expect(putImageData).toHaveBeenCalledTimes(1);
    const [imageData, x, y] = putImageData.mock.calls[0] as [ImageData, number, number];
    expect(x).toBe(0);
    expect(y).toBe(0);
    expect(imageData.width).toBe(2);
    expect(imageData.height).toBe(2);
    expect(Array.from(imageData.data)).toEqual(Array.from(maskToRgba(mask)));
  });

  it("rejects in Italian when the browser has no 2D canvas context", async () => {
    HTMLCanvasElement.prototype.getContext = vi.fn(
      () => null,
    ) as unknown as typeof HTMLCanvasElement.prototype.getContext;

    await expect(exportMaskPng(Uint8Array.from([0]), 1, 1)).rejects.toThrow(
      "Canvas 2D non disponibile in questo browser.",
    );
  });

  it("rejects in Italian when canvas.toBlob yields no blob", async () => {
    HTMLCanvasElement.prototype.getContext = vi.fn(
      () => ({ putImageData: vi.fn() }) as unknown as CanvasRenderingContext2D,
    ) as unknown as typeof HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.toBlob = vi.fn(function (callback: BlobCallback) {
      callback(null);
    }) as unknown as typeof HTMLCanvasElement.prototype.toBlob;

    await expect(exportMaskPng(Uint8Array.from([0]), 1, 1)).rejects.toThrow(
      "Esportazione della maschera non riuscita.",
    );
  });
});
