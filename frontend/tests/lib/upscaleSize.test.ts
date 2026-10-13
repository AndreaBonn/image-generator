import { describe, expect, it } from "vitest";
import { upscaledSizeLabel } from "@/lib/upscaleSize";

describe("upscaledSizeLabel (P4)", () => {
  it("says the size the image will reach", () => {
    expect(upscaledSizeLabel({ width: 1152, height: 896 }, 2)).toBe("Diventa 2304×1792 pixel.");
  });

  it("warns when a side would pass the 8192 pixel limit", () => {
    expect(upscaledSizeLabel({ width: 4096, height: 2048 }, 4)).toBe(
      "Con ×4 un lato supererebbe 8192 pixel: scegli ×2.",
    );
  });

  it("accepts a side exactly at the limit", () => {
    expect(upscaledSizeLabel({ width: 2048, height: 1024 }, 4)).toBe("Diventa 8192×4096 pixel.");
  });
});
