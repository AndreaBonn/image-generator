export type UploadKind = "image" | "mask";

/** Settings embedded in a PNG created by this app (A5 recipe import). */
export interface UploadRecipeParams {
  aspect_ratio: string;
  seed: number;
  style_ids: string[];
  steps: number;
  cfg: number;
}

export interface UploadRecipe {
  task_id: string;
  prompt: string;
  negative_prompt: string;
  params: UploadRecipeParams;
}

/** Response of POST /uploads (SPEC.md § 7.2). `recipe` is optional/null when
 * the image carries no (or an invalid) embedded recipe; optional (not just
 * nullable) so existing mocks of this shape elsewhere keep typechecking. */
export interface UploadResponse {
  upload_id: string;
  width: number;
  height: number;
  recipe?: UploadRecipe | null;
}
