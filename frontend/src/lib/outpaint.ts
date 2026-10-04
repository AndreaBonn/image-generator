/** Pure direction toggle and canvas-preview math for "Allarga l'immagine" (SPEC.md § 3.2, § 11.2). */

export type OutpaintDirection = "top" | "bottom" | "left" | "right";

export const OUTPAINT_DIRECTIONS: readonly OutpaintDirection[] = ["top", "bottom", "left", "right"];

/** 30% of the matching side, per direction (SPEC.md § 3.2, same as Fooocus). */
export const OUTPAINT_EXPAND_RATIO = 0.3;

export function toggleDirection(
  selected: OutpaintDirection[],
  direction: OutpaintDirection,
): OutpaintDirection[] {
  return selected.includes(direction)
    ? selected.filter((candidate) => candidate !== direction)
    : [...selected, direction];
}

export interface OutpaintRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface OutpaintPreview {
  canvasWidth: number;
  canvasHeight: number;
  /** Where the original image sits inside the expanded canvas. */
  imageRect: OutpaintRect;
}

/** New canvas size and the original image's position inside it, for the preview. */
export function computeOutpaintPreview(
  width: number,
  height: number,
  directions: OutpaintDirection[],
): OutpaintPreview {
  const padTop = directions.includes("top") ? Math.round(height * OUTPAINT_EXPAND_RATIO) : 0;
  const padBottom = directions.includes("bottom") ? Math.round(height * OUTPAINT_EXPAND_RATIO) : 0;
  const padLeft = directions.includes("left") ? Math.round(width * OUTPAINT_EXPAND_RATIO) : 0;
  const padRight = directions.includes("right") ? Math.round(width * OUTPAINT_EXPAND_RATIO) : 0;

  return {
    canvasWidth: width + padLeft + padRight,
    canvasHeight: height + padTop + padBottom,
    imageRect: { x: padLeft, y: padTop, width, height },
  };
}
