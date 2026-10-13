const STORAGE_KEY = "image-generator-create-draft-v1";

/** What Crea keeps while the user visits other pages (C16); references are not kept. */
export interface CreateDraft {
  taskId: string | null;
  prompt: string;
  negativePrompt: string;
  aspectRatio: string;
  batch: number;
  styleIds: string[];
  seed: number | null;
  seedLocked: boolean;
  steps: number | null;
  cfg: number | null;
}

function isNullableNumber(value: unknown): value is number | null {
  return value === null || typeof value === "number";
}

function isCreateDraft(value: unknown): value is CreateDraft {
  if (typeof value !== "object" || value === null) return false;
  const draft = value as Record<string, unknown>;
  return (
    (draft.taskId === null || typeof draft.taskId === "string") &&
    typeof draft.prompt === "string" &&
    typeof draft.negativePrompt === "string" &&
    typeof draft.aspectRatio === "string" &&
    typeof draft.batch === "number" &&
    Array.isArray(draft.styleIds) &&
    draft.styleIds.every((id) => typeof id === "string") &&
    isNullableNumber(draft.seed) &&
    typeof draft.seedLocked === "boolean" &&
    isNullableNumber(draft.steps) &&
    isNullableNumber(draft.cfg)
  );
}

/** The draft saved in this browser tab, or null when absent, unreadable or malformed. */
export function loadCreateDraft(): CreateDraft | null {
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (raw === null) return null;
    const parsed: unknown = JSON.parse(raw);
    return isCreateDraft(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function saveCreateDraft(draft: CreateDraft): void {
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(draft));
  } catch {
    // sessionStorage can be unavailable (private mode, quota): the form still works, it just won't survive navigation.
  }
}

export function clearCreateDraft(): void {
  try {
    window.sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // Same as saveCreateDraft: nothing to clean up when storage is unavailable.
  }
}
