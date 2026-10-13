import { describe, expect, it } from "vitest";
import { ratioName, ratioUse } from "@/lib/aspectRatioDisplay";

describe("ratioName (C10)", () => {
  it("drops the pixel size from a catalog label", () => {
    expect(ratioName("Verticale 9:16 · 768×1344")).toBe("Verticale 9:16");
  });

  it("returns a label without a size unchanged", () => {
    expect(ratioName("Quadrato 1:1")).toBe("Quadrato 1:1");
  });
});

describe("ratioUse (C10)", () => {
  it.each([
    [768, 1344, "storie, telefono"],
    [896, 1152, "post social"],
    [1024, 1024, "profilo, post"],
    [1152, 896, "foto classica"],
    [1216, 832, "fotografia"],
    [1344, 768, "schermo, video"],
  ])("names the typical use of %ix%i", (width, height, use) => {
    expect(ratioUse(width, height)).toBe(use);
  });

  it("returns null for a shape with no common use", () => {
    expect(ratioUse(704, 1408)).toBeNull();
  });
});
