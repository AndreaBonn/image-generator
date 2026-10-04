import type { GenerationSummary } from "@/api/types";

export function buildGenerationSummary(
  overrides: Partial<GenerationSummary> = {},
): GenerationSummary {
  return {
    id: "gen-1",
    task_id: "qualita",
    prompt: "portrait of an old fisherman, golden hour",
    seed: 42,
    width: 1152,
    height: 896,
    favorite: false,
    created_at: "2026-10-01T10:00:00Z",
    parent_id: null,
    ...overrides,
  };
}
