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
