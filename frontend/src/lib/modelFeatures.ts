import type { ModelInfo, Task } from "@/api/types";
import { licenseLabel } from "@/lib/modelLicense";

export interface FeatureGroup {
  family: string;
  /** Plain names of the tasks this family makes possible, in catalog order. */
  taskLabels: string[];
  /** Every task of the family is available (its models are installed). */
  ready: boolean;
  /** Disk size of the family's enabled models, in GB. */
  sizeGb: number;
  /** Distinct licenses of those models, said in words. */
  licenses: string[];
}

const SIZE_DECIMALS = 10;

function familiesInTaskOrder(tasks: Task[]): string[] {
  return [...new Set(tasks.map((task) => task.family))];
}

/** Models grouped by what they let the user do (I2), instead of thirteen technical file names. */
export function featureGroups(models: ModelInfo[], tasks: Task[]): FeatureGroup[] {
  return familiesInTaskOrder(tasks).map((family) => {
    const familyTasks = tasks.filter((task) => task.family === family);
    const familyModels = models.filter((model) => model.family === family && model.enabled);
    const size = familyModels.reduce((total, model) => total + (model.size_gb ?? 0), 0);
    return {
      family,
      taskLabels: familyTasks.map((task) => task.label),
      ready: familyTasks.every((task) => task.available),
      sizeGb: Math.round(size * SIZE_DECIMALS) / SIZE_DECIMALS,
      licenses: [...new Set(familyModels.map((model) => licenseLabel(model.license)))],
    };
  });
}
