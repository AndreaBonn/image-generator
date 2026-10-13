import { describe, expect, it } from "vitest";
import { refinementLevel } from "@/lib/refinementLevel";

describe("refinementLevel (P3)", () => {
  it.each([
    [0.1, "poco"],
    [0.2, "poco"],
    [0.25, "abbastanza"],
    [0.35, "abbastanza"],
    [0.4, "molto"],
    [0.5, "molto"],
  ])("describes %f as %s", (denoise, word) => {
    expect(refinementLevel(denoise)).toBe(word);
  });
});
