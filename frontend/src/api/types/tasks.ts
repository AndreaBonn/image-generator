export type TaskGroup = "crea" | "modifica" | "migliora";

export type PromptLanguageRequirement = "en" | "it" | "any";

export interface PromptLanguage {
  required: PromptLanguageRequirement;
  label: string;
  reason: string;
}

export interface AspectRatio {
  value: string;
  width: number;
  height: number;
  label: string;
  featured: boolean;
}

export interface TaskRange {
  min: number;
  max: number;
}

export interface TaskLimits {
  steps: TaskRange;
  cfg: TaskRange;
  /** Only present on tasks that expose a denoise control, e.g. ingrandisci_rifinito. */
  denoise?: TaskRange;
}

export interface TaskDefaults {
  steps: number;
  cfg: number;
  /** Only present on tasks that expose a denoise control, e.g. ingrandisci_rifinito. */
  denoise?: number;
}

export interface Task {
  id: string;
  label: string;
  description: string;
  group: TaskGroup;
  family: string;
  available: boolean;
  unavailable_reason: string | null;
  prompt_language: PromptLanguage;
  prompt_tips: string[];
  prompt_examples: string[];
  supports_styles: boolean;
  supports_negative: boolean;
  default_styles: string[];
  /** One label per reference slot, in order (e.g. ["Posa", "Personaggio"]); null for
   * tasks whose references are interchangeable or that take none at all. */
  reference_labels: string[] | null;
  /** How many reference images this task takes; both 0 when it takes none (SPEC.md § 7.3). */
  min_references: number;
  max_references: number;
  defaults: TaskDefaults;
  limits: TaskLimits;
  aspect_ratios: AspectRatio[];
  default_aspect_ratio: string;
}
