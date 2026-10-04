import { ApiError, isApiErrorBody, networkError } from "@/api/errors";
import type { ApiEnvelope } from "@/api/types";

const API_BASE = "/api/v1";

interface RequestOptions {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
  idempotencyKey?: string;
  signal?: AbortSignal;
}

/**
 * Thin wrapper around fetch for the `/api/v1` backend. Every non-2xx
 * response is parsed against the `{"error": {...}}` envelope (SPEC.md
 * § 7.2) and raised as `ApiError` with an Italian message. A network
 * failure (backend down, DNS, CORS) is mapped to the same type so
 * callers only ever handle one error shape.
 */
async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = "GET", body, idempotencyKey, signal } = options;

  const headers: Record<string, string> = {};
  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
  }
  if (idempotencyKey) {
    headers["Idempotency-Key"] = idempotencyKey;
  }

  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal,
    });
  } catch (cause) {
    throw networkError(cause);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  let parsed: unknown;
  try {
    parsed = await response.json();
  } catch (cause) {
    if (!response.ok) {
      throw new ApiError({
        code: "UNKNOWN_ERROR",
        message: "Si è verificato un errore imprevisto. Riprova.",
        status: response.status,
      });
    }
    throw networkError(cause);
  }

  if (!response.ok) {
    if (isApiErrorBody(parsed)) {
      throw new ApiError({
        code: parsed.error.code,
        message: parsed.error.message,
        status: response.status,
        details: parsed.error.details,
      });
    }
    throw new ApiError({
      code: "UNKNOWN_ERROR",
      message: "Si è verificato un errore imprevisto. Riprova.",
      status: response.status,
    });
  }

  return (parsed as ApiEnvelope<T>).data;
}

export const apiClient = {
  get: <T>(path: string, signal?: AbortSignal) => request<T>(path, { signal }),
  post: <T>(path: string, body?: unknown, idempotencyKey?: string) =>
    request<T>(path, { method: "POST", body, idempotencyKey }),
  patch: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "PATCH", body }),
  del: <T>(path: string) => request<T>(path, { method: "DELETE" }),
};

/** Full paginated envelope, for callers that need `meta` too. */
export async function requestWithMeta<T>(path: string): Promise<ApiEnvelope<T>> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`);
  } catch (cause) {
    throw networkError(cause);
  }
  const parsed = (await response.json()) as unknown;
  if (!response.ok) {
    if (isApiErrorBody(parsed)) {
      throw new ApiError({
        code: parsed.error.code,
        message: parsed.error.message,
        status: response.status,
        details: parsed.error.details,
      });
    }
    throw new ApiError({
      code: "UNKNOWN_ERROR",
      message: "Si è verificato un errore imprevisto. Riprova.",
      status: response.status,
    });
  }
  return parsed as ApiEnvelope<T>;
}

export function newIdempotencyKey(): string {
  return crypto.randomUUID();
}
