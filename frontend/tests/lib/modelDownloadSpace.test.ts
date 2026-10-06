import { describe, expect, it } from "vitest";
import { needsMoreSpace } from "@/lib/modelDownloadSpace";

describe("needsMoreSpace", () => {
  it("is false when free space comfortably covers the model plus the margin", () => {
    expect(needsMoreSpace({ freeGb: 40, neededGb: 10, minFreeGb: 10 })).toBe(false);
  });

  it("is false exactly at the margin (backend's has_room allows the boundary)", () => {
    expect(needsMoreSpace({ freeGb: 20, neededGb: 10, minFreeGb: 10 })).toBe(false);
  });

  it("is true when downloading would leave less than the margin free", () => {
    expect(needsMoreSpace({ freeGb: 15, neededGb: 10, minFreeGb: 10 })).toBe(true);
  });
});
