import { apiClient, newIdempotencyKey, requestWithMeta } from "@/api/client";
import type {
  ClearEngineOutputResult,
  CreateJobBody,
  CreateJobResponse,
  EmptyTrashResult,
  ExamplesResponse,
  Generation,
  GenerationSummary,
  HealthStatus,
  LanguageCheckResult,
  PaginationMeta,
  Style,
  SystemInfo,
  Task,
  TrashSummary,
  UploadKind,
  UploadResponse,
} from "@/api/types";

export function fetchHealth(signal?: AbortSignal): Promise<HealthStatus> {
  return apiClient.get<HealthStatus>("/health", signal);
}

/** Engine, GPU, disk and model inventory shown in Impostazioni (SPEC.md § 11.2). */
export function fetchSystem(signal?: AbortSignal): Promise<SystemInfo> {
  return apiClient.get<SystemInfo>("/system", signal);
}

/** Deletes ComfyUI's own output folder; saved generations are untouched (SPEC.md § 5.5). */
export function clearEngineOutput(): Promise<ClearEngineOutputResult> {
  return apiClient.post<ClearEngineOutputResult>("/maintenance/clear-engine-output");
}

export function fetchTasks(signal?: AbortSignal): Promise<Task[]> {
  return apiClient.get<Task[]>("/tasks", signal);
}

export function fetchStyles(query: string, signal?: AbortSignal): Promise<Style[]> {
  const search = query.trim() ? `?q=${encodeURIComponent(query.trim())}` : "";
  return apiClient.get<Style[]>(`/styles${search}`, signal);
}

/** First-use examples for Crea, "prova questo" (SPEC.md § 11.3, T083). */
export function fetchExamples(signal?: AbortSignal): Promise<ExamplesResponse> {
  return apiClient.get<ExamplesResponse>("/examples", signal);
}

export function checkPromptLanguage(text: string): Promise<LanguageCheckResult> {
  return apiClient.post<LanguageCheckResult>("/prompt/language-check", { text });
}

export function createJob(body: CreateJobBody): Promise<CreateJobResponse> {
  return apiClient.post<CreateJobResponse>("/jobs", body, newIdempotencyKey());
}

/** Multipart upload of an input image or a mask (SPEC.md § 7.2, max 20 MB / 4096 px). */
export function uploadFile(
  file: File,
  kind: UploadKind,
  signal?: AbortSignal,
): Promise<UploadResponse> {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("kind", kind);
  return apiClient.postForm<UploadResponse>("/uploads", formData, signal);
}

export function cancelJob(jobId: string): Promise<void> {
  return apiClient.post<void>(`/jobs/${jobId}/cancel`);
}

export interface GenerationsPage {
  items: GenerationSummary[];
  meta: PaginationMeta;
}

export async function fetchGenerations(params: {
  page?: number;
  perPage?: number;
  taskId?: string;
  /** Any of these tasks (G3 kind filters); sent as repeated task_ids. */
  taskIds?: string[];
  query?: string;
  favorite?: boolean;
  /** A4 trash: lists trashed items (newest deleted first) instead of active ones. */
  trashed?: boolean;
}): Promise<GenerationsPage> {
  const search = new URLSearchParams();
  if (params.page) search.set("page", String(params.page));
  if (params.perPage) search.set("per_page", String(params.perPage));
  if (params.taskId) search.set("task_id", params.taskId);
  for (const id of params.taskIds ?? []) search.append("task_ids", id);
  if (params.query) search.set("q", params.query);
  if (params.favorite !== undefined) search.set("favorite", String(params.favorite));
  if (params.trashed) search.set("trashed", "true");
  const suffix = search.toString() ? `?${search.toString()}` : "";
  const envelope = await requestWithMeta<GenerationSummary[]>(`/generations${suffix}`);
  return { items: envelope.data, meta: envelope.meta as PaginationMeta };
}

export function fetchGeneration(generationId: string, signal?: AbortSignal): Promise<Generation> {
  return apiClient.get<Generation>(`/generations/${generationId}`, signal);
}

export function setFavorite(generationId: string, favorite: boolean): Promise<Generation> {
  return apiClient.patch<Generation>(`/generations/${generationId}`, { favorite });
}

/** Soft-delete: moves the generation to the trash (A4), it is not gone yet. */
export function deleteGeneration(generationId: string): Promise<void> {
  return apiClient.del<void>(`/generations/${generationId}`);
}

export function restoreGeneration(generationId: string): Promise<Generation> {
  return apiClient.post<Generation>(`/generations/${generationId}/restore`);
}

export function fetchTrashSummary(signal?: AbortSignal): Promise<TrashSummary> {
  return apiClient.get<TrashSummary>("/generations/trash/summary", signal);
}

export function emptyTrash(): Promise<EmptyTrashResult> {
  return apiClient.post<EmptyTrashResult>("/generations/trash/empty");
}

export function rerunGeneration(
  generationId: string,
  newSeed: boolean,
): Promise<CreateJobResponse> {
  return apiClient.post<CreateJobResponse>(
    `/generations/${generationId}/rerun`,
    { new_seed: newSeed },
    newIdempotencyKey(),
  );
}

/** Starts the single, app-wide model download (202; backend runs it in the
 * background and reports progress over GET /models/downloads/events). */
export function startModelDownload(modelId: string): Promise<void> {
  return apiClient.post<void>(`/models/${modelId}/install`);
}

export function cancelModelDownload(modelId: string): Promise<void> {
  return apiClient.post<void>(`/models/${modelId}/install/cancel`);
}

export function imageUrl(generationId: string): string {
  return `/api/v1/generations/${generationId}/image`;
}

export function thumbnailUrl(generationId: string): string {
  return `/api/v1/generations/${generationId}/thumbnail`;
}
