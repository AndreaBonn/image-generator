import type { ModelInfo } from "@/api/types/models";

export interface HealthStatus {
  backend: "ok";
  engine: "ok" | "unreachable";
}

export type EngineStatus = "ok" | "unreachable";

export interface EngineInfo {
  status: EngineStatus;
  comfyui_version: string | null;
}

export interface GpuProcess {
  name: string;
  used_mb: number;
}

/** null when the engine has no GPU info to report (e.g. unreachable). */
export interface GpuInfo {
  name: string;
  vram_total_mb: number;
  vram_free_mb: number;
  other_processes: GpuProcess[];
}

export interface DiskInfo {
  free_gb: number;
  min_free_gb: number;
}

/** GET /system (SPEC.md § 5.3, § 11.2): engine, GPU, disk and model inventory. */
export interface SystemInfo {
  engine: EngineInfo;
  gpu: GpuInfo | null;
  disk: DiskInfo;
  loaded_family: string | null;
  models: ModelInfo[];
  install_command: string;
}

/** Response of POST /maintenance/clear-engine-output. */
export interface ClearEngineOutputResult {
  removed_files: number;
  freed_mb: number;
}
