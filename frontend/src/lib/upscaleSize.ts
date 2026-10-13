// Same limit the backend enforces on every side of an upscaled image (image_geometry.MAX_OUTPUT_SIDE).
// Uploads stop at 4096 px per side, so only ×4 can pass it and the advice is always ×2.
const MAX_OUTPUT_SIDE = 8192;

/** The size an image reaches with the plain upscale (P4), or why that factor is not possible. */
export function upscaledSizeLabel(size: { width: number; height: number }, factor: 2 | 4): string {
  const width = size.width * factor;
  const height = size.height * factor;
  if (Math.max(width, height) > MAX_OUTPUT_SIDE) {
    return `Con ×${factor} un lato supererebbe ${MAX_OUTPUT_SIDE} pixel: scegli ×2.`;
  }
  return `Diventa ${width}×${height} pixel.`;
}
