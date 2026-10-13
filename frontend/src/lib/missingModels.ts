import type { DiskInfo, ModelInfo, Task } from "@/api/types";
import { needsMoreSpace } from "@/lib/modelDownloadSpace";

export interface MissingModelsPlan {
  /** Missing models in the task's order, as /system reports them. */
  models: ModelInfo[];
  /** Sum of their sizes; null when any size is unknown. */
  totalGb: number | null;
  /** True when every missing model can be installed from the app. */
  downloadable: boolean;
  /** True when the total would leave less than the free-space margin. */
  shortOfSpace: boolean;
  /** True when /system already has every listed model: the task list is just stale. */
  allInstalled: boolean;
}

/** An unavailable task whose only obstacle is models the app can fetch. */
export function canOfferModelDownload(task: Task): boolean {
  return !task.available && task.missing_model_ids.length > 0;
}

/**
 * Joins a task's missing model ids with the /system inventory. A model that
 * /system does not list, or lists as disabled, cannot be downloaded from the
 * app (backend model_downloads rejects it), so the whole plan is not offered.
 */
export function planMissingModels({
  task,
  models,
  disk,
}: {
  task: Task;
  models: ModelInfo[];
  disk: DiskInfo;
}): MissingModelsPlan {
  const byId = new Map(models.map((model) => [model.id, model]));
  const resolved = task.missing_model_ids.map((id) => byId.get(id));
  // The task list can lag behind /system: a model installed meanwhile is no longer offered.
  const found = resolved.filter((model): model is ModelInfo => model !== undefined && model.status !== "installed");
  const downloadable =
    found.length > 0 && resolved.every((model) => model !== undefined) && found.every((model) => model.enabled);
  const sizes = found.map((model) => model.size_gb);
  const totalGb = sizes.every((size) => size !== null)
    ? sizes.reduce<number>((sum, size) => sum + (size as number), 0)
    : null;
  const shortOfSpace =
    totalGb !== null && needsMoreSpace({ freeGb: disk.free_gb, neededGb: totalGb, minFreeGb: disk.min_free_gb });
  const allInstalled = resolved.length > 0 && resolved.every((model) => model?.status === "installed");
  return { models: found, totalGb, downloadable, shortOfSpace, allInstalled };
}
