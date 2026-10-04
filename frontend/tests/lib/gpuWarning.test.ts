import { describe, expect, it } from "vitest";
import { shouldWarnAboutGpu } from "@/lib/gpuWarning";
import { buildGpuInfo } from "../fixtures/system";

describe("shouldWarnAboutGpu", () => {
  it("does not warn when low free VRAM is held by our own engine", () => {
    const gpu = buildGpuInfo({ vram_free_mb: 1500, other_processes: [] });
    expect(shouldWarnAboutGpu(gpu)).toBe(false);
  });

  it("warns when another process is using the GPU, even with plenty of free VRAM", () => {
    const gpu = buildGpuInfo({
      vram_free_mb: 7500,
      other_processes: [{ name: "ollama", used_mb: 6000 }],
    });
    expect(shouldWarnAboutGpu(gpu)).toBe(true);
  });

  it("does not warn when the GPU info is unavailable", () => {
    expect(shouldWarnAboutGpu(null)).toBe(false);
    expect(shouldWarnAboutGpu(undefined)).toBe(false);
  });
});
