import { describe, expect, it } from "vitest";
import { cleanGpuName, formatMbAsGb, formatSizeGb } from "@/lib/format";

describe("format helpers", () => {
  it("formats sizes in Italian with one decimal", () => {
    expect(formatSizeGb(28.430408477783203)).toBe("28,4 GB");
    expect(formatSizeGb(6.617371544241905)).toBe("6,6 GB");
  });

  it("switches to MB and kB for small sizes", () => {
    expect(formatSizeGb(0.04615)).toBe("47 MB");
    expect(formatSizeGb(0.0000489894)).toBe("51 kB");
  });

  it("formats VRAM megabytes as gigabytes with a comma", () => {
    expect(formatMbAsGb(7800)).toBe("7,6 GB");
  });

  it("strips the device index and allocator from the engine GPU name", () => {
    expect(cleanGpuName("cuda:0 NVIDIA GeForce RTX 4060 Laptop GPU : cudaMallocAsync")).toBe(
      "NVIDIA GeForce RTX 4060 Laptop GPU",
    );
    expect(cleanGpuName("Apple M3")).toBe("Apple M3");
  });
});
