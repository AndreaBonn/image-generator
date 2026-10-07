export interface LanguageCheckResult {
  looks_italian: boolean;
}

/** One entry of GET /examples (SPEC.md § 11.3, "Prova questo"): a ready-made prompt/seed/
 * format for a task, with its already-generated preview image. */
export interface ExampleItem {
  id: string;
  task_id: string;
  prompt: string;
  seed: number;
  aspect_ratio: string;
  width: number;
  height: number;
  /** WEBP, long side 768px. */
  image_url: string;
}

/** GET /examples: `first_use` is true only when the gallery has never had a generation
 * (trash included); `examples` may be empty when none have been generated yet. */
export interface ExamplesResponse {
  first_use: boolean;
  examples: ExampleItem[];
}
