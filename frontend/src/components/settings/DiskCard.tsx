import type { DiskInfo } from "@/api/types";
import { formatSizeGb } from "@/lib/format";

export function DiskCard({ disk }: { disk: DiskInfo }) {
  const low = disk.free_gb < disk.min_free_gb;

  return (
    <section className="flex flex-col gap-1 rounded-md border border-border bg-paper-2 p-3">
      <h2 className="text-sm font-semibold text-ink">Disco</h2>
      <p className={low ? "text-sm font-medium text-danger" : "text-sm text-ink"}>
        {formatSizeGb(disk.free_gb)} liberi{low ? ` (minimo consigliato ${formatSizeGb(disk.min_free_gb)})` : ""}
      </p>
    </section>
  );
}
