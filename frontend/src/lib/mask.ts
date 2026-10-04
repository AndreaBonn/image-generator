/**
 * Pure pixel logic for the inpaint mask editor (SPEC.md § 11.2). No canvas,
 * no DOM: a mask is a single-channel Uint8Array of `width * height`, where
 * 0 means "keep" (black) and 255 means "regenerate" (white, the red
 * channel the backend reads). Kept canvas-free so it is testable in jsdom
 * and so undo/redo history holds plain, comparable snapshots.
 */

export type MaskValue = 0 | 255;

export interface MaskPoint {
  x: number;
  y: number;
}

export function createEmptyMask(width: number, height: number): Uint8Array {
  return new Uint8Array(width * height);
}

/** True when nothing is marked for regeneration (SPEC.md § 11.2: disables Genera). */
export function isMaskEmpty(mask: Uint8Array): boolean {
  return mask.every((value) => value === 0);
}

export function invertMask(mask: Uint8Array): Uint8Array {
  const result = new Uint8Array(mask.length);
  for (let i = 0; i < mask.length; i++) {
    result[i] = 255 - (mask[i] ?? 0);
  }
  return result;
}

/**
 * Pointer events arrive tens of pixels apart on a fast drag; stamping only the
 * samples leaves a dotted line. Insert points so consecutive stamps are at most
 * `spacing` apart and the stroke stays continuous.
 */
export function interpolateStroke(points: MaskPoint[], spacing: number): MaskPoint[] {
  const result: MaskPoint[] = [];
  points.forEach((point, index) => {
    const previous = points[index - 1];
    if (previous) {
      const distance = Math.hypot(point.x - previous.x, point.y - previous.y);
      const steps = Math.floor(distance / spacing);
      for (let step = 1; step < steps; step++) {
        const ratio = step / steps;
        result.push({
          x: previous.x + (point.x - previous.x) * ratio,
          y: previous.y + (point.y - previous.y) * ratio,
        });
      }
    }
    result.push(point);
  });
  return result;
}

/**
 * Stamps filled circles of `value` at every point of a stroke onto a copy
 * of `mask`. Points come from one continuous pointer drag; painting them
 * together keeps one undo step per stroke instead of one per pointermove.
 */
export function paintStroke(
  mask: Uint8Array,
  width: number,
  height: number,
  points: MaskPoint[],
  radius: number,
  value: MaskValue,
): Uint8Array {
  const result = new Uint8Array(mask);
  const radiusSq = radius * radius;

  for (const point of interpolateStroke(points, Math.max(1, radius / 2))) {
    const minX = Math.max(0, Math.floor(point.x - radius));
    const maxX = Math.min(width - 1, Math.ceil(point.x + radius));
    const minY = Math.max(0, Math.floor(point.y - radius));
    const maxY = Math.min(height - 1, Math.ceil(point.y + radius));

    for (let y = minY; y <= maxY; y++) {
      const dy = y - point.y;
      const rowOffset = y * width;
      for (let x = minX; x <= maxX; x++) {
        const dx = x - point.x;
        if (dx * dx + dy * dy <= radiusSq) {
          result[rowOffset + x] = value;
        }
      }
    }
  }

  return result;
}

/** Grayscale RGBA export: white/black PNG at the mask's own resolution. */
export function maskToRgba(mask: Uint8Array): Uint8ClampedArray<ArrayBuffer> {
  const rgba = new Uint8ClampedArray(mask.length * 4);
  for (let i = 0; i < mask.length; i++) {
    const value = mask[i] ?? 0;
    const offset = i * 4;
    rgba[offset] = value;
    rgba[offset + 1] = value;
    rgba[offset + 2] = value;
    rgba[offset + 3] = 255;
  }
  return rgba;
}

export interface OverlayColor {
  r: number;
  g: number;
  b: number;
}

/** Translucent color overlay for drawing the masked zone over the source image. */
export function maskToOverlayRgba(
  mask: Uint8Array,
  color: OverlayColor,
  alpha: number,
): Uint8ClampedArray<ArrayBuffer> {
  const rgba = new Uint8ClampedArray(mask.length * 4);
  const alphaByte = Math.round(Math.max(0, Math.min(1, alpha)) * 255);
  for (let i = 0; i < mask.length; i++) {
    const painted = (mask[i] ?? 0) > 0;
    const offset = i * 4;
    rgba[offset] = color.r;
    rgba[offset + 1] = color.g;
    rgba[offset + 2] = color.b;
    rgba[offset + 3] = painted ? alphaByte : 0;
  }
  return rgba;
}

/** At least 20 undo steps (SPEC.md § 11.2); oldest snapshots drop past this. */
export const MASK_HISTORY_LIMIT = 20;

export interface MaskHistory {
  entries: Uint8Array[];
  index: number;
}

export function createMaskHistory(initial: Uint8Array): MaskHistory {
  return { entries: [initial], index: 0 };
}

export function currentMask(history: MaskHistory): Uint8Array {
  const mask = history.entries[history.index];
  if (!mask) {
    throw new Error("Invalid mask history: index out of range.");
  }
  return mask;
}

export function canUndoMaskHistory(history: MaskHistory): boolean {
  return history.index > 0;
}

export function canRedoMaskHistory(history: MaskHistory): boolean {
  return history.index < history.entries.length - 1;
}

/**
 * Appends a new snapshot, discarding any redo-able future (standard
 * undo/redo branching) and capping total size at MASK_HISTORY_LIMIT by
 * dropping the oldest entries.
 */
export function pushMaskHistory(history: MaskHistory, mask: Uint8Array): MaskHistory {
  const truncated = history.entries.slice(0, history.index + 1);
  truncated.push(mask);

  const overflow = truncated.length - MASK_HISTORY_LIMIT;
  const entries = overflow > 0 ? truncated.slice(overflow) : truncated;

  return { entries, index: entries.length - 1 };
}

export function undoMaskHistory(history: MaskHistory): MaskHistory {
  if (!canUndoMaskHistory(history)) return history;
  return { ...history, index: history.index - 1 };
}

export function redoMaskHistory(history: MaskHistory): MaskHistory {
  if (!canRedoMaskHistory(history)) return history;
  return { ...history, index: history.index + 1 };
}
