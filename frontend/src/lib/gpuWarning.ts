import type { GpuInfo } from "@/api/types";

/**
 * Below this free VRAM, generating alongside another program risks the
 * Xid 79 "GPU has fallen off the bus" crash observed 2026-10-04, recoverable
 * only with a reboot (SPEC.md § 5.3).
 */
export const GPU_WARNING_FREE_VRAM_MB = 6000;

/** True when the GPU card deserves a warning before generating (SPEC.md § 5.3). */
export function shouldWarnAboutGpu(gpu: GpuInfo | null | undefined): boolean {
  if (!gpu) return false;
  return gpu.vram_free_mb < GPU_WARNING_FREE_VRAM_MB || gpu.other_processes.length > 0;
}
