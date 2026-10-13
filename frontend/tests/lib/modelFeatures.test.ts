import { describe, expect, it } from "vitest";
import { featureGroups } from "@/lib/modelFeatures";
import { buildModelInfo } from "../fixtures/system";
import { buildTask } from "../fixtures/task";

describe("featureGroups (I2)", () => {
  const models = [
    buildModelInfo({ id: "jug", family: "sdxl", size_gb: 6.6, license: "RunDiffusion, da verificare" }),
    buildModelInfo({ id: "lora", family: "sdxl", size_gb: 0.4, license: "openrail++" }),
    buildModelInfo({ id: "flux", family: "flux2_klein", size_gb: 3.8, license: "apache-2.0" }),
    buildModelInfo({ id: "bf16", family: "flux2_klein", size_gb: 7.5, enabled: false, status: "missing" }),
    buildModelInfo({ id: "birefnet", family: "background", size_gb: 0.4, license: "mit", status: "missing" }),
  ];
  const tasks = [
    buildTask({ id: "bozza", label: "Bozza veloce", family: "sdxl" }),
    buildTask({ id: "testo", label: "Testo", family: "flux2_klein" }),
    buildTask({ id: "qualita", label: "Immagine di qualità", family: "sdxl" }),
    buildTask({ id: "sfondo", label: "Rimuovi lo sfondo", family: "background", available: false }),
  ];

  it("groups the enabled models by the tasks they make possible, in task order", () => {
    expect(featureGroups(models, tasks)).toEqual([
      {
        family: "sdxl",
        taskLabels: ["Bozza veloce", "Immagine di qualità"],
        ready: true,
        sizeGb: 7,
        licenses: ["RunDiffusion, da verificare", "Libera, con alcuni divieti d'uso (OpenRAIL++)"],
      },
      {
        family: "flux2_klein",
        taskLabels: ["Testo"],
        ready: true,
        sizeGb: 3.8,
        licenses: ["Libera, anche commerciale (Apache 2.0)"],
      },
      {
        family: "background",
        taskLabels: ["Rimuovi lo sfondo"],
        ready: false,
        sizeGb: 0.4,
        licenses: ["Libera, anche commerciale (MIT)"],
      },
    ]);
  });

  it("returns no groups without tasks", () => {
    expect(featureGroups(models, [])).toEqual([]);
  });
});
