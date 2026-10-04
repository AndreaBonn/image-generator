import { describe, expect, it } from "vitest";
import {
  canRedoMaskHistory,
  canUndoMaskHistory,
  createEmptyMask,
  createMaskHistory,
  currentMask,
  invertMask,
  isMaskEmpty,
  maskToOverlayRgba,
  maskToRgba,
  MASK_HISTORY_LIMIT,
  paintStroke,
  pushMaskHistory,
  redoMaskHistory,
  undoMaskHistory,
} from "@/lib/mask";

describe("createEmptyMask", () => {
  it("creates a width*height mask with every pixel black (keep)", () => {
    const mask = createEmptyMask(3, 2);
    expect(mask.length).toBe(6);
    expect(Array.from(mask)).toEqual([0, 0, 0, 0, 0, 0]);
  });
});

describe("isMaskEmpty", () => {
  it("is true when nothing is painted", () => {
    expect(isMaskEmpty(createEmptyMask(4, 4))).toBe(true);
  });

  it("is false once at least one pixel is marked for regeneration", () => {
    const mask = createEmptyMask(4, 4);
    mask[5] = 255;
    expect(isMaskEmpty(mask)).toBe(false);
  });
});

describe("invertMask", () => {
  it("flips black and white pixels and keeps the original array untouched", () => {
    const mask = Uint8Array.from([0, 255, 0, 255]);
    const inverted = invertMask(mask);
    expect(Array.from(inverted)).toEqual([255, 0, 255, 0]);
    expect(Array.from(mask)).toEqual([0, 255, 0, 255]);
  });

  it("round-trips: inverting twice returns the original pattern", () => {
    const mask = Uint8Array.from([0, 255, 255, 0]);
    expect(Array.from(invertMask(invertMask(mask)))).toEqual(Array.from(mask));
  });
});

describe("paintStroke", () => {
  it("paints a single pixel with radius 0 and leaves the rest black", () => {
    const mask = createEmptyMask(5, 5);
    const result = paintStroke(mask, 5, 5, [{ x: 2, y: 2 }], 0, 255);
    expect(result[2 * 5 + 2]).toBe(255);
    expect(result[0]).toBe(0);
  });

  it("paints a filled circle: center and near pixels set, far corner untouched", () => {
    const mask = createEmptyMask(10, 10);
    const result = paintStroke(mask, 10, 10, [{ x: 5, y: 5 }], 3, 255);
    expect(result[5 * 10 + 5]).toBe(255);
    expect(result[5 * 10 + 6]).toBe(255);
    expect(result[0 * 10 + 0]).toBe(0);
  });

  it("clips the stamp at the canvas edge instead of writing out of bounds", () => {
    const mask = createEmptyMask(4, 4);
    expect(() => paintStroke(mask, 4, 4, [{ x: 0, y: 0 }], 5, 255)).not.toThrow();
    const result = paintStroke(mask, 4, 4, [{ x: 0, y: 0 }], 5, 255);
    expect(result.length).toBe(16);
  });

  it("erases (value 0) over previously painted pixels", () => {
    const painted = paintStroke(createEmptyMask(5, 5), 5, 5, [{ x: 2, y: 2 }], 2, 255);
    const erased = paintStroke(painted, 5, 5, [{ x: 2, y: 2 }], 2, 0);
    expect(isMaskEmpty(erased)).toBe(true);
  });

  it("does not mutate the mask passed in", () => {
    const mask = createEmptyMask(3, 3);
    paintStroke(mask, 3, 3, [{ x: 1, y: 1 }], 1, 255);
    expect(isMaskEmpty(mask)).toBe(true);
  });
});

describe("maskToRgba (export, SPEC.md § 11.2: white = regenerate, black = keep)", () => {
  it("maps black to an opaque black pixel and white to an opaque white pixel", () => {
    const mask = Uint8Array.from([0, 255]);
    const rgba = maskToRgba(mask);
    expect(Array.from(rgba)).toEqual([0, 0, 0, 255, 255, 255, 255, 255]);
  });

  it("keeps the export at the mask's own resolution", () => {
    const mask = createEmptyMask(8, 6);
    expect(maskToRgba(mask).length).toBe(8 * 6 * 4);
  });
});

describe("maskToOverlayRgba", () => {
  const color = { r: 239, g: 68, b: 68 };

  it("is fully transparent over black (kept) pixels", () => {
    const rgba = maskToOverlayRgba(Uint8Array.from([0]), color, 0.5);
    expect(Array.from(rgba)).toEqual([239, 68, 68, 0]);
  });

  it("applies the given alpha over white (painted) pixels", () => {
    const rgba = maskToOverlayRgba(Uint8Array.from([255]), color, 0.5);
    expect(Array.from(rgba)).toEqual([239, 68, 68, 128]);
  });
});

describe("mask history (undo/redo)", () => {
  function fill(value: number): Uint8Array {
    return Uint8Array.from([value]);
  }

  it("starts with only the initial snapshot, nothing to undo or redo", () => {
    const history = createMaskHistory(fill(0));
    expect(canUndoMaskHistory(history)).toBe(false);
    expect(canRedoMaskHistory(history)).toBe(false);
    expect(Array.from(currentMask(history))).toEqual([0]);
  });

  it("undo restores the previous snapshot, redo brings the undone one back", () => {
    let history = createMaskHistory(fill(0));
    history = pushMaskHistory(history, fill(1));
    history = pushMaskHistory(history, fill(2));

    history = undoMaskHistory(history);
    expect(Array.from(currentMask(history))).toEqual([1]);

    history = redoMaskHistory(history);
    expect(Array.from(currentMask(history))).toEqual([2]);
  });

  it("discards the redo-able future once a new stroke is pushed after an undo", () => {
    let history = createMaskHistory(fill(0));
    history = pushMaskHistory(history, fill(1));
    history = pushMaskHistory(history, fill(2));
    history = undoMaskHistory(history);

    history = pushMaskHistory(history, fill(9));

    expect(Array.from(currentMask(history))).toEqual([9]);
    expect(canRedoMaskHistory(history)).toBe(false);
  });

  it("truncates past 20 steps, dropping the oldest and keeping the newest reachable", () => {
    let history = createMaskHistory(fill(0));
    for (let i = 1; i <= 24; i++) {
      history = pushMaskHistory(history, fill(i));
    }

    expect(history.entries.length).toBe(MASK_HISTORY_LIMIT);
    expect(Array.from(currentMask(history))).toEqual([24]);

    for (let i = 0; i < MASK_HISTORY_LIMIT - 1; i++) {
      history = undoMaskHistory(history);
    }
    // 25 pushes (0..24) capped at 20 entries drops the oldest 5 (0..4).
    expect(Array.from(currentMask(history))).toEqual([5]);
    expect(canUndoMaskHistory(history)).toBe(false);
  });
});

describe("paintStroke continuity", () => {
  it("fills the gap between two distant pointer samples", () => {
    const width = 120;
    const height = 20;
    const mask = paintStroke(createEmptyMask(width, height), width, height, [
      { x: 10, y: 10 },
      { x: 110, y: 10 },
    ], 4, 255);
    expect(mask[10 * width + 60]).toBe(255);
    expect(mask[10 * width + 35]).toBe(255);
  });

  it("does not paint outside the stroke corridor", () => {
    const width = 120;
    const height = 40;
    const mask = paintStroke(createEmptyMask(width, height), width, height, [
      { x: 10, y: 10 },
      { x: 110, y: 10 },
    ], 4, 255);
    expect(mask[30 * width + 60]).toBe(0);
  });
});
