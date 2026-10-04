import { describe, expect, it } from "vitest";
import { computeOutpaintPreview, toggleDirection } from "@/lib/outpaint";

describe("toggleDirection", () => {
  it("adds a direction that was not selected", () => {
    expect(toggleDirection([], "top")).toEqual(["top"]);
  });

  it("removes a direction that was already selected", () => {
    expect(toggleDirection(["top", "left"], "top")).toEqual(["left"]);
  });
});

describe("computeOutpaintPreview", () => {
  it("keeps the original size and position when no direction is selected", () => {
    const preview = computeOutpaintPreview(1000, 800, []);
    expect(preview).toEqual({
      canvasWidth: 1000,
      canvasHeight: 800,
      imageRect: { x: 0, y: 0, width: 1000, height: 800 },
    });
  });

  it("expands only the left side by 30% of the width", () => {
    const preview = computeOutpaintPreview(1000, 800, ["left"]);
    expect(preview.canvasWidth).toBe(1300);
    expect(preview.canvasHeight).toBe(800);
    expect(preview.imageRect).toEqual({ x: 300, y: 0, width: 1000, height: 800 });
  });

  it("expands every side by 30% when all four directions are selected", () => {
    const preview = computeOutpaintPreview(1000, 800, ["top", "bottom", "left", "right"]);
    expect(preview.canvasWidth).toBe(1000 + 300 + 300);
    expect(preview.canvasHeight).toBe(800 + 240 + 240);
    expect(preview.imageRect).toEqual({ x: 300, y: 240, width: 1000, height: 800 });
  });
});
