import type { GpuInfo } from "@/api/types";

/**
 * True when another program holds GPU memory (SPEC.md § 5.3). Generating while
 * Ollama had a model loaded crashed the GPU with Xid 79 on 2026-10-04. Low free
 * VRAM alone is not a signal: our own engine keeps its models resident.
 */
export function shouldWarnAboutGpu(gpu: GpuInfo | null | undefined): boolean {
  return Boolean(gpu && gpu.other_processes.length > 0);
}
