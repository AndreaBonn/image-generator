import type { DiskInfo } from "@/api/types";

export function DiskCard({ disk }: { disk: DiskInfo }) {
  const low = disk.free_gb < disk.min_free_gb;

  return (
    <section className="flex flex-col gap-1 rounded-md border border-border bg-paper-2 p-3">
      <h2 className="text-sm font-semibold text-ink">Disco</h2>
      <p className={low ? "text-sm font-medium text-danger" : "text-sm text-ink"}>
        {disk.free_gb} GB liberi{low ? ` (minimo consigliato ${disk.min_free_gb} GB)` : ""}
      </p>
    </section>
  );
}
