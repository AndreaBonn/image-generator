import { Link } from "react-router-dom";
import type { DiskInfo, TrashSummary } from "@/api/types";
import { formatBytes, formatSizeGb } from "@/lib/format";
import { InfoTip } from "@/components/ui/InfoTip";
import { HELP_TEXTS } from "@/lib/helpTexts";

interface DiskCardProps {
  disk: DiskInfo;
  /** Omitted while loading or on error (A4): the trash line is a nice-to-have, never blocks the card. */
  trashSummary?: TrashSummary;
}

export function DiskCard({ disk, trashSummary }: DiskCardProps) {
  const low = disk.free_gb < disk.min_free_gb;

  return (
    <section className="flex flex-col gap-1 rounded-md border border-border bg-paper-2 p-3">
      <h2 className="flex items-center gap-1 text-sm font-semibold text-ink">
        Disco
        <InfoTip text={HELP_TEXTS.diskSpace} label="Informazioni: Disco" />
      </h2>
      <p className={low ? "text-sm font-medium text-danger" : "text-sm text-ink"}>
        {formatSizeGb(disk.free_gb)} liberi{low ? ` (minimo consigliato ${formatSizeGb(disk.min_free_gb)})` : ""}
      </p>
      {trashSummary && trashSummary.count > 0 ? (
        <p className="text-sm text-ink-muted">
          Cestino: {trashSummary.count} {trashSummary.count === 1 ? "immagine" : "immagini"} (
          {formatBytes(trashSummary.bytes)}).{" "}
          <Link to="/galleria?view=cestino" className="text-accent-text underline">
            Vai al cestino
          </Link>
        </p>
      ) : null}
    </section>
  );
}
