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

interface FieldResolution {
  patch: Partial<RecipeImportPatch>;
  skipped: string[];
}

type FieldResolver = (recipe: UploadRecipe, task: Task, availableStyles: Style[]) => FieldResolution;

/** Every catalog-dependent field the recipe carries, labelled as skipped (no valid task to check them). */
function skippedWithoutTask(recipe: UploadRecipe): string[] {
  return [
    "compito",
    "proporzioni",
    ...(recipe.negative_prompt.trim() !== "" ? ["prompt negativo"] : []),
    ...(recipe.params.style_ids.length > 0 ? ["stili"] : []),
    "passi di generazione",
    "aderenza al prompt",
  ];
}

// UploadRecipeParams has no references field (SPEC.md § 7.3): a recipe for
// a task that takes reference images can never carry them back.
const resolveReferences: FieldResolver = (_recipe, task) => ({
  patch: {},
  skipped: task.max_references > 0 ? ["riferimenti"] : [],
});

// A skipped field takes the task's default: the form may still hold a value from
// the previously selected task that is invalid for this one.
const resolveAspectRatio: FieldResolver = (recipe, task) => {
  const ratio = task.aspect_ratios.find((candidate) => candidate.value === recipe.params.aspect_ratio);
  return ratio
    ? { patch: { aspectRatio: ratio.value }, skipped: [] }
    : { patch: { aspectRatio: task.default_aspect_ratio }, skipped: ["proporzioni"] };
};

const resolveNegativePrompt: FieldResolver = (recipe, task) => {
  if (recipe.negative_prompt.trim() === "") return { patch: {}, skipped: [] };
  return task.supports_negative
    ? { patch: { negativePrompt: recipe.negative_prompt }, skipped: [] }
    : { patch: {}, skipped: ["prompt negativo"] };
};

const resolveStyles: FieldResolver = (recipe, task, availableStyles) => {
  const requested = recipe.params.style_ids;
  if (requested.length === 0) return { patch: {}, skipped: [] };
  if (!task.supports_styles) return { patch: {}, skipped: ["stili"] };
  const knownIds = new Set(availableStyles.map((style) => style.id));
  const validIds = requested.filter((id) => knownIds.has(id));
  return { patch: { styleIds: validIds }, skipped: validIds.length < requested.length ? ["stili"] : [] };
};

const resolveSteps: FieldResolver = (recipe, task) => {
  const { steps } = recipe.params;
  return steps >= task.limits.steps.min && steps <= task.limits.steps.max
    ? { patch: { steps }, skipped: [] }
    : { patch: { steps: task.defaults.steps }, skipped: ["passi di generazione"] };
};

const resolveCfg: FieldResolver = (recipe, task) => {
  const { cfg } = recipe.params;
  return cfg >= task.limits.cfg.min && cfg <= task.limits.cfg.max
    ? { patch: { cfg }, skipped: [] }
    : { patch: { cfg: task.defaults.cfg }, skipped: ["aderenza al prompt"] };
};

/** Applied in this order, so `skipped` keeps a stable, readable sequence. */
const FIELD_RESOLVERS: FieldResolver[] = [
  resolveReferences,
  resolveAspectRatio,
  resolveNegativePrompt,
  resolveStyles,
  resolveSteps,
  resolveCfg,
];

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
  const base: RecipeImportPatch = { prompt: recipe.prompt, seed: recipe.params.seed };
  const task = tasks.find((candidate) => candidate.id === recipe.task_id);
  if (task === undefined || !task.available) {
    return { patch: base, skipped: skippedWithoutTask(recipe) };
  }
  const parts = FIELD_RESOLVERS.map((resolve) => resolve(recipe, task, availableStyles));
  return {
    patch: Object.assign({ ...base, taskId: task.id }, ...parts.map((part) => part.patch)),
    skipped: parts.flatMap((part) => part.skipped),
  };
}
