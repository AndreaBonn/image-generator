import type { Style, Task, UploadRecipe } from "@/api/types";

export interface RecipeImportPatch {
  taskId?: string;
  prompt: string;
  negativePrompt?: string;
  aspectRatio?: string;
  seed: number;
  styleIds?: string[];
  steps?: number;
  cfg?: number;
}

export interface RecipeImportResult {
  patch: RecipeImportPatch;
  /** Italian labels of fields that were not applied because they are not valid for the current catalog (A5). */
  skipped: string[];
}

/**
 * Resolves an embedded recipe (A5) against the current task/style catalog.
 * Prompt and seed are catalog-independent and always applied; every other
 * field depends on the recipe's task, so an unknown/unavailable task skips
 * them all instead of guessing a fallback catalog to validate against.
 */
export function resolveRecipeImport(
  recipe: UploadRecipe,
  tasks: Task[],
  availableStyles: Style[],
): RecipeImportResult {
  const skipped: string[] = [];
  const patch: RecipeImportPatch = {
    prompt: recipe.prompt,
    seed: recipe.params.seed,
  };

  const task = tasks.find((candidate) => candidate.id === recipe.task_id);
  const taskValid = task !== undefined && task.available;

  if (!taskValid) {
    skipped.push("compito");
    skipped.push("proporzioni");
    if (recipe.negative_prompt.trim() !== "") skipped.push("prompt negativo");
    if (recipe.params.style_ids.length > 0) skipped.push("stili");
    skipped.push("passi di generazione");
    skipped.push("aderenza al prompt");
    return { patch, skipped };
  }

  patch.taskId = task.id;

  // UploadRecipeParams has no references field (SPEC.md § 7.3): a recipe for
  // a task that takes reference images can never carry them back.
  if (task.max_references > 0) {
    skipped.push("riferimenti");
  }

  // A skipped field takes the task's default: the form may still hold a value from
  // the previously selected task that is invalid for this one.
  const ratio = task.aspect_ratios.find((candidate) => candidate.value === recipe.params.aspect_ratio);
  if (ratio) {
    patch.aspectRatio = ratio.value;
  } else {
    patch.aspectRatio = task.default_aspect_ratio;
    skipped.push("proporzioni");
  }

  if (recipe.negative_prompt.trim() !== "") {
    if (task.supports_negative) {
      patch.negativePrompt = recipe.negative_prompt;
    } else {
      skipped.push("prompt negativo");
    }
  }

  if (recipe.params.style_ids.length > 0) {
    if (task.supports_styles) {
      const knownIds = new Set(availableStyles.map((style) => style.id));
      const validIds = recipe.params.style_ids.filter((id) => knownIds.has(id));
      patch.styleIds = validIds;
      if (validIds.length < recipe.params.style_ids.length) skipped.push("stili");
    } else {
      skipped.push("stili");
    }
  }

  const { steps, cfg } = recipe.params;
  if (steps >= task.limits.steps.min && steps <= task.limits.steps.max) {
    patch.steps = steps;
  } else {
    patch.steps = task.defaults.steps;
    skipped.push("passi di generazione");
  }
  if (cfg >= task.limits.cfg.min && cfg <= task.limits.cfg.max) {
    patch.cfg = cfg;
  } else {
    patch.cfg = task.defaults.cfg;
    skipped.push("aderenza al prompt");
  }

  return { patch, skipped };
}
