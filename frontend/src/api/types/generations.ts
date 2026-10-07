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
