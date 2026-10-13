import type { SystemInfo, Task } from "@/api/types";
import { formatSizeGb } from "@/lib/format";

export interface ReadinessCheck {
  ok: boolean;
  text: string;
}

function tasksCheck(tasks: Task[]): ReadinessCheck {
  const available = tasks.filter((task) => task.available).length;
  const noun = available === 1 ? "lavoro disponibile" : "lavori disponibili";
  const base = `${available} ${noun} su ${tasks.length}`;
  return available === tasks.length
    ? { ok: true, text: base }
    : { ok: false, text: `${base}: mancano alcuni modelli, vedi sotto` };
}

function gpuCheck(gpu: SystemInfo["gpu"]): ReadinessCheck {
  if (!gpu) return { ok: false, text: "Scheda video non rilevata" };
  if (gpu.other_processes.length === 0) return { ok: true, text: "Scheda video: nessun altro programma la usa" };
  const names = gpu.other_processes.map((process) => process.name).join(", ");
  return { ok: false, text: `Scheda video: in uso anche da ${names}` };
}

/** The answers to "can I work now?" shown at the top of Impostazioni (I1). */
export function readinessChecks(system: SystemInfo, tasks: Task[]): ReadinessCheck[] {
  const { free_gb: free, min_free_gb: minimum } = system.disk;
  return [
    system.engine.status === "ok" ? { ok: true, text: "Motore acceso" } : { ok: false, text: "Motore spento" },
    tasksCheck(tasks),
    free >= minimum
      ? { ok: true, text: `Disco: ${formatSizeGb(free)} liberi` }
      : { ok: false, text: `Disco: ${formatSizeGb(free)} liberi, meno dei ${formatSizeGb(minimum)} consigliati` },
    gpuCheck(system.gpu),
  ];
}
