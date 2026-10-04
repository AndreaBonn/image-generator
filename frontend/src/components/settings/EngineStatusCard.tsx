import type { EngineInfo } from "@/api/types";

export function EngineStatusCard({ engine }: { engine: EngineInfo }) {
  return (
    <section className="flex flex-col gap-1 rounded-md border border-border bg-paper-2 p-3">
      <h2 className="text-sm font-semibold text-ink">Motore</h2>
      {engine.status === "ok" ? (
        <p className="text-sm text-ink">
          Acceso{engine.comfyui_version ? `, versione ${engine.comfyui_version}` : ""}.
        </p>
      ) : (
        <p className="text-sm text-danger">Non risponde.</p>
      )}
    </section>
  );
}
