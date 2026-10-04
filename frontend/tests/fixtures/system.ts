import type { GpuInfo, ModelInfo, SystemInfo } from "@/api/types";

export function buildGpuInfo(overrides: Partial<GpuInfo> = {}): GpuInfo {
  return {
    name: "NVIDIA GeForce RTX 4060 Laptop",
    vram_total_mb: 8192,
    vram_free_mb: 7000,
    other_processes: [],
    ...overrides,
  };
}

export function buildModelInfo(overrides: Partial<ModelInfo> = {}): ModelInfo {
  return {
    id: "juggernaut-xl-v8",
    label: "Juggernaut XL v8",
    family: "sdxl",
    status: "installed",
    size_gb: 6.6,
    enabled: true,
    license: "CreativeML Open RAIL-M",
    ...overrides,
  };
}

export function buildSystemInfo(overrides: Partial<SystemInfo> = {}): SystemInfo {
  return {
    engine: { status: "ok", comfyui_version: "0.3.0" },
    gpu: buildGpuInfo(),
    disk: { free_gb: 40, min_free_gb: 10 },
    loaded_family: "sdxl",
    models: [buildModelInfo()],
    install_command: "uv run --script scripts/install_models.py",
    ...overrides,
  };
}
