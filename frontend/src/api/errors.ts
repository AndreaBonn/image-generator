import type { ApiErrorBody, ApiErrorDetail } from "@/api/types";

/**
 * Raised for every non-2xx response or network failure. `message` is
 * always Italian and safe to show directly to the user (SPEC.md § 7.2).
 */
export class ApiError extends Error {
  readonly code: string;
  readonly details: ApiErrorDetail[];
  readonly status: number;

  constructor(options: {
    code: string;
    message: string;
    status: number;
    details?: ApiErrorDetail[];
  }) {
    super(options.message);
    this.name = "ApiError";
    this.code = options.code;
    this.status = options.status;
    this.details = options.details ?? [];
  }
}

const NETWORK_ERROR_MESSAGE =
  "Impossibile contattare il server. Verifica che il backend sia avviato.";

export function isApiErrorBody(value: unknown): value is ApiErrorBody {
  return (
    typeof value === "object" &&
    value !== null &&
    "error" in value &&
    typeof (value as { error?: unknown }).error === "object"
  );
}

export function networkError(cause: unknown): ApiError {
  return new ApiError({
    code: "NETWORK_ERROR",
    message: NETWORK_ERROR_MESSAGE,
    status: 0,
    details: cause instanceof Error ? [{ message: cause.message }] : [],
  });
}
