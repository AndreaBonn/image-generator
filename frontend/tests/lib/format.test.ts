import { describe, expect, it } from "vitest";
import { cleanGpuName, formatBytes, formatMbAsGb, formatSizeGb, formatRelativeTime } from "@/lib/format";

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

  it("formats a byte count (A4 trash freed_bytes) the same way as formatSizeGb", () => {
    expect(formatBytes(12 * 1024 ** 2)).toBe("12 MB");
    expect(formatBytes(2.5 * 1024 ** 3)).toBe("2,5 GB");
    expect(formatBytes(0)).toBe("0 kB");
  });
});

describe("formatRelativeTime (G1)", () => {
  const now = new Date("2026-10-13T18:00:00Z");

  it.each([
    ["2026-10-13T17:59:40Z", "adesso"],
    ["2026-10-13T17:55:00Z", "5 minuti fa"],
    ["2026-10-13T15:00:00Z", "3 ore fa"],
    ["2026-10-12T12:00:00Z", "ieri"],
    ["2026-10-10T12:00:00Z", "3 giorni fa"],
  ])("says %s as %s", (iso, expected) => {
    expect(formatRelativeTime(iso, now)).toBe(expected);
  });

  it("falls back to the date after a week", () => {
    expect(formatRelativeTime("2026-09-01T12:00:00Z", now)).toBe("1 set 2026");
  });
});
