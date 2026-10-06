/**
 * Backend contract types, isolated here on purpose (SPEC.md § 7.2-7.3).
 * The backend is being written in parallel: if the exact shape drifts
 * once it lands, only this file (and client.ts's parsing) should need
 * to change.
 */

export type TaskGroup = "crea" | "modifica" | "migliora";

export type PromptLanguageRequirement = "en" | "it" | "any";

export interface PromptLanguage {
  required: PromptLanguageRequirement;
  label: string;
  reason: string;
}

export interface AspectRatio {
  value: string;
  width: number;
  height: number;
  label: string;
  featured: boolean;
}

export interface TaskRange {
  min: number;
  max: number;
}

export interface TaskLimits {
  steps: TaskRange;
  cfg: TaskRange;
  /** Only present on tasks that expose a denoise control, e.g. ingrandisci_rifinito. */
  denoise?: TaskRange;
}

export interface TaskDefaults {
  steps: number;
  cfg: number;
  /** Only present on tasks that expose a denoise control, e.g. ingrandisci_rifinito. */
  denoise?: number;
}

export interface Task {
  id: string;
  label: string;
  description: string;
  group: TaskGroup;
  family: string;
  available: boolean;
  unavailable_reason: string | null;
  prompt_language: PromptLanguage;
  prompt_tips: string[];
  prompt_examples: string[];
  supports_styles: boolean;
  supports_negative: boolean;
  default_styles: string[];
  /** One label per reference slot, in order (e.g. ["Posa", "Personaggio"]); null for
   * tasks whose references are interchangeable or that take none at all. */
  reference_labels: string[] | null;
  /** How many reference images this task takes; both 0 when it takes none (SPEC.md § 7.3). */
  min_references: number;
  max_references: number;
  defaults: TaskDefaults;
  limits: TaskLimits;
  aspect_ratios: AspectRatio[];
  default_aspect_ratio: string;
}

export interface Style {
  id: string;
  name: string;
  source_file: string;
  /** WEBP 256px, null if the preview has not been generated yet (SPEC.md § O9). */
  preview_url?: string | null;
}

/** Full record, returned by GET /generations/{id} and the favorite/rerun mutations. */
export interface Generation {
  id: string;
  job_id: string;
  task_id: string;
  model_ids: string[];
  prompt: string;
  negative_prompt: string;
  prompt_final: string;
  params: Record<string, unknown>;
  seed: number;
  width: number;
  height: number;
  parent_id: string | null;
  duration_ms: number | null;
  favorite: boolean;
  created_at: string;
  updated_at: string;
}

/** Reduced row returned by the paginated GET /generations list (SPEC.md § 7.2). */
export interface GenerationSummary {
  id: string;
  task_id: string;
  prompt: string;
  seed: number;
  width: number;
  height: number;
  favorite: boolean;
  created_at: string;
  parent_id: string | null;
  thumbnail_url?: string;
}

export interface JobParams {
  /** Optional: inpaint/outpaint jobs omit it, the source image sets the output size (SPEC.md § 7.3). */
  aspect_ratio?: string;
  seed: number | null;
  batch: number;
  style_ids?: string[];
  steps?: number | null;
  cfg?: number | null;
  /** Refinement strength for ingrandisci_rifinito, 0.1-0.5 (backend JobParams.denoise). */
  denoise?: number | null;
}

export type OutpaintDirection = "top" | "bottom" | "left" | "right";

/** One reference image for crea_da_riferimenti: exactly one of the two fields (SPEC.md § 7.3). */
export type ReferenceInput = { upload_id: string } | { generation_id: string };

export interface CreateJobBody {
  task_id: string;
  prompt: string;
  negative_prompt?: string;
  params: JobParams;
  input_upload_id?: string | null;
  mask_upload_id?: string | null;
  source_generation_id?: string | null;
  outpaint_directions?: OutpaintDirection[];
  upscale_factor?: number | null;
  references?: ReferenceInput[] | null;
}

export type UploadKind = "image" | "mask";

/** Settings embedded in a PNG created by this app (A5 recipe import). */
export interface UploadRecipeParams {
  aspect_ratio: string;
  seed: number;
  style_ids: string[];
  steps: number;
  cfg: number;
}

export interface UploadRecipe {
  task_id: string;
  prompt: string;
  negative_prompt: string;
  params: UploadRecipeParams;
}

/** Response of POST /uploads (SPEC.md § 7.2). `recipe` is optional/null when
 * the image carries no (or an invalid) embedded recipe; optional (not just
 * nullable) so existing mocks of this shape elsewhere keep typechecking. */
export interface UploadResponse {
  upload_id: string;
  width: number;
  height: number;
  recipe?: UploadRecipe | null;
}

export interface CreateJobResponse {
  job_id: string;
}

export type JobStatus = "queued" | "running" | "completed" | "failed" | "cancelled";

export interface JobDetail {
  id: string;
  task_id: string;
  status: JobStatus;
  error_code: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

/** SSE events from GET /api/v1/jobs/{id}/events (SPEC.md § 7.2). `preview`
 * is handled inside useJobEvents (surfaced as `latestPreviewUrl`, not
 * pushed into `events`), so it rarely needs matching elsewhere. */
export type JobEvent =
  | { type: "queued"; position: number }
  | { type: "model_switch"; family: string; eta_s: number }
  | { type: "progress"; step: number; total: number }
  | { type: "preview"; url: string }
  | { type: "completed"; generation_ids: string[] }
  | { type: "failed"; code: string; message: string }
  | { type: "cancelled" };

/** SSE events from GET /api/v1/models/downloads/events (SPEC.md § 7.2, T026-T028).
 * Single, app-wide stream: at most one model downloads at a time, and no event
 * carries a model id (useModelDownload attributes progress to whichever model
 * id its own `start()` call targeted). */
export type ModelDownloadEvent =
  | { type: "progress"; bytes: number; total: number }
  | { type: "verifying" }
  | { type: "completed" }
  | { type: "failed"; code: string; message: string }
  | { type: "cancelled" };

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

export type ModelStatus = "installed" | "missing";

export interface ModelInfo {
  install_command?: string;
  id: string;
  label: string;
  family: string;
  status: ModelStatus;
  size_gb: number | null;
  enabled: boolean;
  license: string;
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

/** GET /generations/trash/summary (A4 trash). */
export interface TrashSummary {
  count: number;
  bytes: number;
}

/** POST /generations/trash/empty (A4 trash). */
export interface EmptyTrashResult {
  purged: number;
  freed_bytes: number;
}

export interface PaginationMeta {
  page: number;
  per_page: number;
  total: number;
  total_pages: number;
}

export interface LanguageCheckResult {
  looks_italian: boolean;
}

/** One entry of GET /examples (SPEC.md § 11.3, "Prova questo"): a ready-made prompt/seed/
 * format for a task, with its already-generated preview image. */
export interface ExampleItem {
  id: string;
  task_id: string;
  prompt: string;
  seed: number;
  aspect_ratio: string;
  width: number;
  height: number;
  /** WEBP, long side 768px. */
  image_url: string;
}

/** GET /examples: `first_use` is true only when the gallery has never had a generation
 * (trash included); `examples` may be empty when none have been generated yet. */
export interface ExamplesResponse {
  first_use: boolean;
  examples: ExampleItem[];
}

export interface ApiEnvelope<T> {
  data: T;
  meta?: PaginationMeta | Record<string, unknown>;
}

export interface ApiErrorDetail {
  field?: string;
  message: string;
}

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    details?: ApiErrorDetail[];
  };
}
