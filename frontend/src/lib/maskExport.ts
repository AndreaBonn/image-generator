import { maskToRgba } from "@/lib/mask";

/**
 * Encodes a mask (SPEC.md § 11.2) as a white/black PNG at its own
 * resolution, via an offscreen canvas. The only non-pure step; pixel
 * computation itself (`maskToRgba`) is tested without a canvas.
 */
export function exportMaskPng(mask: Uint8Array, width: number, height: number): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return Promise.reject(new Error("Canvas 2D non disponibile in questo browser."));
  }

  const imageData = new ImageData(maskToRgba(mask), width, height);
  ctx.putImageData(imageData, 0, 0);

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob);
      } else {
        reject(new Error("Esportazione della maschera non riuscita."));
      }
    }, "image/png");
  });
}
