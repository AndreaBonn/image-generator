import { describe, expect, it } from "vitest";
import { familyLabel } from "@/lib/modelFamily";

describe("familyLabel", () => {
  it("returns 'Nessuno' when no model family is loaded", () => {
    expect(familyLabel(null)).toBe("Nessuno");
  });

  it("maps a known family id to its human-readable label", () => {
    expect(familyLabel("sdxl")).toBe("SDXL (Juggernaut)");
    expect(familyLabel("flux2_klein")).toBe("FLUX.2 klein");
    expect(familyLabel("sdxl_libero")).toBe("SDXL (Lustify)");
  });

  it("falls back to the raw family id when it has no known label", () => {
    expect(familyLabel("some_future_family")).toBe("some_future_family");
  });
});
