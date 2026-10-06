import { describe, expect, it } from "vitest";
import { resolveRecipeImport } from "@/lib/recipeImport";
import { buildTask } from "../fixtures/task";
import type { Style, UploadRecipe } from "@/api/types";

function buildRecipe(overrides: Partial<UploadRecipe> = {}): UploadRecipe {
  return {
    task_id: "qualita",
    prompt: "portrait of an old fisherman, golden hour",
    negative_prompt: "blurry, low quality",
    params: {
      aspect_ratio: "1152*896",
      seed: 42,
      style_ids: ["fooocus-sharp"],
      steps: 30,
      cfg: 4,
    },
    ...overrides,
  };
}

function buildStyle(overrides: Partial<Style> = {}): Style {
  return { id: "fooocus-sharp", name: "Fooocus Sharp", source_file: "x.json", ...overrides };
}

describe("resolveRecipeImport", () => {
  it("applies every field of a fully valid recipe against the matching task", () => {
    const tasks = [buildTask({ id: "qualita" })];
    const styles = [buildStyle()];

    const result = resolveRecipeImport(buildRecipe(), tasks, styles);

    expect(result.patch).toEqual({
      prompt: "portrait of an old fisherman, golden hour",
      seed: 42,
      taskId: "qualita",
      aspectRatio: "1152*896",
      negativePrompt: "blurry, low quality",
      styleIds: ["fooocus-sharp"],
      steps: 30,
      cfg: 4,
    });
    expect(result.skipped).toEqual([]);
  });

  it("skips every task-dependent field when the recipe's task_id is unknown, keeping prompt and seed", () => {
    const tasks = [buildTask({ id: "qualita" })];

    const result = resolveRecipeImport(buildRecipe({ task_id: "non-esiste" }), tasks, []);

    expect(result.patch).toEqual({
      prompt: "portrait of an old fisherman, golden hour",
      seed: 42,
    });
    expect(result.skipped).toEqual([
      "compito",
      "proporzioni",
      "prompt negativo",
      "stili",
      "passi di generazione",
      "aderenza al prompt",
    ]);
  });

  it("skips every task-dependent field when the matching task exists but is unavailable", () => {
    const tasks = [buildTask({ id: "qualita", available: false })];

    const result = resolveRecipeImport(buildRecipe(), tasks, []);

    expect(result.patch.taskId).toBeUndefined();
    expect(result.skipped).toContain("compito");
  });

  it("does not report a skipped negative prompt or styles when the recipe has none, on an unknown task", () => {
    const tasks = [buildTask({ id: "qualita" })];

    const result = resolveRecipeImport(
      buildRecipe({ task_id: "non-esiste", negative_prompt: "", params: { ...buildRecipe().params, style_ids: [] } }),
      tasks,
      [],
    );

    expect(result.skipped).toEqual(["compito", "proporzioni", "passi di generazione", "aderenza al prompt"]);
  });

  it("falls back to the task's default aspect ratio when the recipe's is not in its catalog", () => {
    const tasks = [buildTask({ id: "qualita", default_aspect_ratio: "1152*896" })];

    const result = resolveRecipeImport(
      buildRecipe({ params: { ...buildRecipe().params, aspect_ratio: "999*999" } }),
      tasks,
      [buildStyle()],
    );

    expect(result.patch.aspectRatio).toBe("1152*896");
    expect(result.patch.taskId).toBe("qualita");
    expect(result.skipped).toEqual(["proporzioni"]);
  });

  it("filters out unknown style ids and reports styles as partially skipped", () => {
    const tasks = [buildTask({ id: "qualita" })];
    const styles = [buildStyle({ id: "fooocus-sharp" })];

    const result = resolveRecipeImport(
      buildRecipe({ params: { ...buildRecipe().params, style_ids: ["fooocus-sharp", "sconosciuto"] } }),
      tasks,
      styles,
    );

    expect(result.patch.styleIds).toEqual(["fooocus-sharp"]);
    expect(result.skipped).toEqual(["stili"]);
  });

  it("skips styles entirely when the task does not support them", () => {
    const tasks = [buildTask({ id: "qualita", supports_styles: false })];

    const result = resolveRecipeImport(buildRecipe(), tasks, [buildStyle()]);

    expect(result.patch.styleIds).toBeUndefined();
    expect(result.skipped).toContain("stili");
  });

  it("skips the negative prompt when the task does not support it", () => {
    const tasks = [buildTask({ id: "qualita", supports_negative: false })];

    const result = resolveRecipeImport(buildRecipe(), tasks, [buildStyle()]);

    expect(result.patch.negativePrompt).toBeUndefined();
    expect(result.skipped).toContain("prompt negativo");
  });

  it("does not report the negative prompt as skipped when the recipe's negative prompt is blank", () => {
    const tasks = [buildTask({ id: "qualita", supports_negative: true })];

    const result = resolveRecipeImport(buildRecipe({ negative_prompt: "   " }), tasks, [buildStyle()]);

    expect(result.patch.negativePrompt).toBeUndefined();
    expect(result.skipped).not.toContain("prompt negativo");
  });

  it("falls back to the task's default steps and cfg when the recipe's fall outside its limits", () => {
    const tasks = [
      buildTask({
        id: "qualita",
        defaults: { steps: 30, cfg: 4 },
        limits: { steps: { min: 10, max: 60 }, cfg: { min: 1, max: 12 } },
      }),
    ];

    const result = resolveRecipeImport(
      buildRecipe({ params: { ...buildRecipe().params, steps: 5, cfg: 99 } }),
      tasks,
      [buildStyle()],
    );

    expect(result.patch.steps).toBe(30);
    expect(result.patch.cfg).toBe(4);
    expect(result.skipped).toEqual(["passi di generazione", "aderenza al prompt"]);
  });

  it("keeps steps and cfg at the exact boundary values of the task's limits", () => {
    const tasks = [
      buildTask({ id: "qualita", limits: { steps: { min: 10, max: 60 }, cfg: { min: 1, max: 12 } } }),
    ];

    const result = resolveRecipeImport(
      buildRecipe({ params: { ...buildRecipe().params, steps: 60, cfg: 1 } }),
      tasks,
      [buildStyle()],
    );

    expect(result.patch.steps).toBe(60);
    expect(result.patch.cfg).toBe(1);
    expect(result.skipped).toEqual([]);
  });

  it("reports references as skipped for crea_da_riferimenti (SPEC.md § 7.3: recipes never carry them)", () => {
    const tasks = [
      buildTask({
        id: "crea_da_riferimenti",
        supports_styles: false,
        supports_negative: false,
        min_references: 1,
        max_references: 3,
      }),
    ];

    const result = resolveRecipeImport(
      buildRecipe({ task_id: "crea_da_riferimenti", negative_prompt: "", params: { ...buildRecipe().params, style_ids: [] } }),
      tasks,
      [],
    );

    expect(result.patch.taskId).toBe("crea_da_riferimenti");
    expect(result.skipped).toContain("riferimenti");
  });
});
