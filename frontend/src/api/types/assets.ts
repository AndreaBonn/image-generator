export type AssetKind = "examples" | "styles";
export type AssetGenerationStatus = "idle" | "running" | "completed" | "failed" | "cancelled";

/** GET /assets/generation (I4): the one run that creates examples or style previews. */
export interface AssetGeneration {
  kind: AssetKind | null;
  status: AssetGenerationStatus;
  done: number;
  total: number;
  message: string | null;
}
