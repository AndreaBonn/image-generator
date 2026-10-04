import type { GpuInfo } from "@/api/types";
import { cleanGpuName, formatMbAsGb } from "@/lib/format";
import { shouldWarnAboutGpu } from "@/lib/gpuWarning";
import { GpuWarningMessage } from "@/components/layout/GpuWarningMessage";

export function GpuCard({ gpu }: { gpu: GpuInfo }) {
  const usedMb = gpu.vram_total_mb - gpu.vram_free_mb;
  const usedPercent = gpu.vram_total_mb > 0 ? Math.round((usedMb / gpu.vram_total_mb) * 100) : 0;

  return (
    <section className="flex flex-col gap-2 rounded-md border border-border bg-paper-2 p-3">
      <h2 className="text-sm font-semibold text-ink">Scheda video</h2>
      <p className="text-sm text-ink">{cleanGpuName(gpu.name)}</p>
      <div
        role="progressbar"
        aria-label="VRAM in uso"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={usedPercent}
        className="h-3 w-full overflow-hidden rounded-full bg-paper-3"
      >
        <div className="h-full bg-accent" style={{ width: `${usedPercent}%` }} />
      </div>
      <p className="text-sm text-ink-muted">
        {formatMbAsGb(gpu.vram_free_mb)} liberi di {formatMbAsGb(gpu.vram_total_mb)}
      </p>
      {shouldWarnAboutGpu(gpu) ? <GpuWarningMessage processes={gpu.other_processes} /> : null}
    </section>
  );
}
