import { describe, expect, it } from "vitest";
import { GPU_WARNING_FREE_VRAM_MB, shouldWarnAboutGpu } from "@/lib/gpuWarning";
import { buildGpuInfo } from "../fixtures/system";

describe("shouldWarnAboutGpu", () => {
  it("warns when free VRAM is below the threshold", () => {
    const gpu = buildGpuInfo({ vram_free_mb: GPU_WARNING_FREE_VRAM_MB - 1 });
    expect(shouldWarnAboutGpu(gpu)).toBe(true);
  });

  it("warns when another process is using the GPU, even with plenty of free VRAM", () => {
    const gpu = buildGpuInfo({
      vram_free_mb: 7500,
      other_processes: [{ name: "ollama", used_mb: 6000 }],
    });
    expect(shouldWarnAboutGpu(gpu)).toBe(true);
  });

  it("does not warn when VRAM is plentiful and no other process is running", () => {
    const gpu = buildGpuInfo({ vram_free_mb: GPU_WARNING_FREE_VRAM_MB, other_processes: [] });
    expect(shouldWarnAboutGpu(gpu)).toBe(false);
  });

  it("does not warn when the GPU info is unavailable", () => {
    expect(shouldWarnAboutGpu(null)).toBe(false);
    expect(shouldWarnAboutGpu(undefined)).toBe(false);
  });
});
