import type { GpuProcess } from "@/api/types";

interface GpuWarningMessageProps {
  processes: GpuProcess[];
}

/**
 * Shared copy for the GPU-contention warning, used both by the compact
 * banner on Crea/Modifica/Migliora and by the full card in Impostazioni
 * (SPEC.md § 5.3).
 */
export function GpuWarningMessage({ processes }: GpuWarningMessageProps) {
  return (
    <div
      role="alert"
      className="flex flex-col gap-1 rounded-md border border-warning bg-paper-2 px-3 py-2 text-sm"
    >
      <p className="font-medium text-ink">Un altro programma sta usando la scheda video.</p>
      {processes.length > 0 ? (
        <ul className="list-disc pl-5 text-ink-muted">
          {processes.map((process) => (
            <li key={process.name}>
              {process.name}: {process.used_mb} MB
            </li>
          ))}
        </ul>
      ) : null}
      <p className="text-ink-muted">
        Chiudi gli altri programmi prima di generare: in passato una generazione in
        contemporanea a un altro carico sulla scheda video ha bloccato la GPU.
      </p>
    </div>
  );
}
