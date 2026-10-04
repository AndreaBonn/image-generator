import { apiClient, newIdempotencyKey, requestWithMeta } from "@/api/client";
import type {
  CreateJobBody,
  CreateJobResponse,
  Generation,
  GenerationSummary,
  HealthStatus,
  LanguageCheckResult,
  PaginationMeta,
  Style,
  Task,
  UploadKind,
  UploadResponse,
} from "@/api/types";

export function fetchHealth(signal?: AbortSignal): Promise<HealthStatus> {
  return apiClient.get<HealthStatus>("/health", signal);
}

export function fetchTasks(signal?: AbortSignal): Promise<Task[]> {
  return apiClient.get<Task[]>("/tasks", signal);
}

export function fetchStyles(query: string, signal?: AbortSignal): Promise<Style[]> {
  const search = query.trim() ? `?q=${encodeURIComponent(query.trim())}` : "";
  return apiClient.get<Style[]>(`/styles${search}`, signal);
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
  query?: string;
  favorite?: boolean;
}): Promise<GenerationsPage> {
  const search = new URLSearchParams();
  if (params.page) search.set("page", String(params.page));
  if (params.perPage) search.set("per_page", String(params.perPage));
  if (params.taskId) search.set("task_id", params.taskId);
  if (params.query) search.set("q", params.query);
  if (params.favorite !== undefined) search.set("favorite", String(params.favorite));
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

export function deleteGeneration(generationId: string): Promise<void> {
  return apiClient.del<void>(`/generations/${generationId}`);
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

export function imageUrl(generationId: string): string {
  return `/api/v1/generations/${generationId}/image`;
}

export function thumbnailUrl(generationId: string): string {
  return `/api/v1/generations/${generationId}/thumbnail`;
}
