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

export type ModelStatus = "installed" | "missing";

export interface ModelInfo {
  install_command?: string;
  /** Steps for a model the app cannot download (e.g. from Civitai). */
  manual_install?: string | null;
  id: string;
  label: string;
  family: string;
  status: ModelStatus;
  size_gb: number | null;
  enabled: boolean;
  license: string;
}
