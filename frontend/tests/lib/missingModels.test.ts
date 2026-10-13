import { describe, expect, it } from "vitest";
import { canOfferModelDownload, planMissingModels } from "@/lib/missingModels";
import { buildTask } from "../fixtures/task";
import { buildModelInfo } from "../fixtures/system";

const DISK = { free_gb: 40, min_free_gb: 5 };

const checkpoint = buildModelInfo({ id: "juggernaut_xl_v8", label: "Juggernaut XL v8", status: "missing", size_gb: 6.6 });
const lora = buildModelInfo({ id: "sdxl_lightning_lora", label: "SDXL-Lightning", status: "missing", size_gb: 0.4 });

function missingTask(ids: string[]) {
  return buildTask({ id: "bozza", available: false, unavailable_reason: "Modelli non installati.", missing_model_ids: ids });
}

describe("canOfferModelDownload", () => {
  it("offers a download only for an unavailable task that lists missing models", () => {
    expect(canOfferModelDownload(missingTask(["juggernaut_xl_v8"]))).toBe(true);
    expect(canOfferModelDownload(missingTask([]))).toBe(false);
    expect(canOfferModelDownload(buildTask({ available: true }))).toBe(false);
  });
});

describe("planMissingModels", () => {
  it("resolves the missing models in task order with their total size", () => {
    const plan = planMissingModels({
      task: missingTask(["juggernaut_xl_v8", "sdxl_lightning_lora"]),
      models: [lora, checkpoint],
      disk: DISK,
    });

    expect(plan.models.map((model) => model.id)).toEqual(["juggernaut_xl_v8", "sdxl_lightning_lora"]);
    expect(plan.totalGb).toBeCloseTo(7.0);
    expect(plan.downloadable).toBe(true);
    expect(plan.shortOfSpace).toBe(false);
  });

  it("flags a total that would leave less than the free-space margin", () => {
    const plan = planMissingModels({
      task: missingTask(["juggernaut_xl_v8", "sdxl_lightning_lora"]),
      models: [checkpoint, lora],
      disk: { free_gb: 10, min_free_gb: 5 },
    });

    expect(plan.downloadable).toBe(true);
    expect(plan.shortOfSpace).toBe(true);
  });

  it("is not downloadable when a missing model is disabled or unknown to /system", () => {
    const disabled = buildModelInfo({ id: "juggernaut_xl_v8", status: "missing", enabled: false });

    expect(planMissingModels({ task: missingTask(["juggernaut_xl_v8"]), models: [disabled], disk: DISK }).downloadable).toBe(false);
    expect(planMissingModels({ task: missingTask(["ghost"]), models: [checkpoint], disk: DISK }).downloadable).toBe(false);
  });

  it("drops models /system already reports installed, e.g. after a queue cancelled half-way", () => {
    const installed = { ...checkpoint, status: "installed" as const };
    const plan = planMissingModels({
      task: missingTask(["juggernaut_xl_v8", "sdxl_lightning_lora"]),
      models: [installed, lora],
      disk: DISK,
    });

    expect(plan.models.map((model) => model.id)).toEqual(["sdxl_lightning_lora"]);
    expect(plan.totalGb).toBeCloseTo(0.4);
    expect(plan.downloadable).toBe(true);
    expect(plan.allInstalled).toBe(false);
  });

  it("reports allInstalled when /system has every listed model installed", () => {
    const installed = [checkpoint, lora].map((model) => ({ ...model, status: "installed" as const }));
    const plan = planMissingModels({ task: missingTask(["juggernaut_xl_v8", "sdxl_lightning_lora"]), models: installed, disk: DISK });

    expect(plan.allInstalled).toBe(true);
    expect(plan.downloadable).toBe(false);
    expect(planMissingModels({ task: missingTask([]), models: installed, disk: DISK }).allInstalled).toBe(false);
  });

  it("leaves the total unknown, and space unchecked, when a size is unknown", () => {
    const unsized = buildModelInfo({ id: "juggernaut_xl_v8", status: "missing", size_gb: null });
    const plan = planMissingModels({ task: missingTask(["juggernaut_xl_v8"]), models: [unsized], disk: { free_gb: 1, min_free_gb: 5 } });

    expect(plan.totalGb).toBeNull();
    expect(plan.shortOfSpace).toBe(false);
    expect(plan.downloadable).toBe(true);
  });
});
