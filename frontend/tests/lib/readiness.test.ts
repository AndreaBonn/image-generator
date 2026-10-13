import { describe, expect, it } from "vitest";
import { readinessChecks } from "@/lib/readiness";
import { buildGpuInfo, buildSystemInfo } from "../fixtures/system";
import { buildTask } from "../fixtures/task";

describe("readinessChecks (I1)", () => {
  it("reports every check as fine on a healthy system", () => {
    const checks = readinessChecks(buildSystemInfo(), [buildTask({ id: "a" }), buildTask({ id: "b" })]);

    expect(checks).toEqual([
      { ok: true, text: "Motore acceso" },
      { ok: true, text: "2 lavori disponibili su 2" },
      { ok: true, text: "Disco: 40,0 GB liberi" },
      { ok: true, text: "Scheda video: nessun altro programma la usa" },
    ]);
  });

  it("flags a stopped engine, missing models, a full disk and a busy GPU", () => {
    const system = buildSystemInfo({
      engine: { status: "unreachable", comfyui_version: null },
      disk: { free_gb: 3, min_free_gb: 10 },
      gpu: buildGpuInfo({ other_processes: [{ name: "ollama", used_mb: 4000 }] }),
    });
    const tasks = [buildTask({ id: "a" }), buildTask({ id: "b", available: false })];

    expect(readinessChecks(system, tasks)).toEqual([
      { ok: false, text: "Motore spento" },
      { ok: false, text: "1 lavoro disponibile su 2: mancano alcuni modelli, vedi sotto" },
      { ok: false, text: "Disco: 3,0 GB liberi, meno dei 10,0 GB consigliati" },
      { ok: false, text: "Scheda video: in uso anche da ollama" },
    ]);
  });

  it("says when no graphics card is reported", () => {
    const checks = readinessChecks(buildSystemInfo({ gpu: null }), [buildTask()]);

    expect(checks[3]).toEqual({ ok: false, text: "Scheda video non rilevata" });
  });
});
