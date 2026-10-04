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
}

export interface TaskDefaults {
  steps: number;
  cfg: number;
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
  defaults: TaskDefaults;
  limits: TaskLimits;
  aspect_ratios: AspectRatio[];
  default_aspect_ratio: string;
}

export interface Style {
  id: string;
  name: string;
  source_file: string;
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
}

export type OutpaintDirection = "top" | "bottom" | "left" | "right";

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
}

export type UploadKind = "image" | "mask";

/** Response of POST /uploads (SPEC.md § 7.2). */
export interface UploadResponse {
  upload_id: string;
  width: number;
  height: number;
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

/** SSE events from GET /api/v1/jobs/{id}/events (SPEC.md § 7.2). */
export type JobEvent =
  | { type: "queued"; position: number }
  | { type: "model_switch"; family: string; eta_s: number }
  | { type: "progress"; step: number; total: number; preview_url?: string }
  | { type: "completed"; generation_ids: string[] }
  | { type: "failed"; code: string; message: string }
  | { type: "cancelled" };

export interface HealthStatus {
  backend: "ok";
  engine: "ok" | "unreachable";
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
