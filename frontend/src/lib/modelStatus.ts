import type { ModelStatus } from "@/api/types";

const STATUS_LABELS: Record<ModelStatus, string> = {
  installed: "Installato",
  missing: "Mancante",
  reused: "Riusato da Fooocus",
  "reused-missing": "Riusato ma non trovato",
};

/** Italian label for a model's install status (SPEC.md § 11.2). */
export function modelStatusLabel(status: ModelStatus): string {
  return STATUS_LABELS[status];
}
