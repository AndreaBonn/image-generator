import type { GenerationSummary } from "@/api/types";
import { thumbnailUrl } from "@/api/queries";
import { formatRelativeTime } from "@/lib/format";

interface GenerationCardProps {
  generation: GenerationSummary;
  /** Plain name of the task that made it, e.g. "Foto realistica" (G1); omitted when the catalog is not loaded. */
  taskLabel?: string;
  onOpen: (id: string) => void;
}

/**
 * One gallery thumbnail; opens the detail panel on click (SPEC.md § 11.2).
 * "Rimuovi lo sfondo" results are transparent PNGs (thumbnail keeps alpha):
 * shown on a checkerboard so the transparency is visible at a glance.
 */
export function GenerationCard({ generation, taskLabel, onOpen }: GenerationCardProps) {
  const isTransparent = generation.task_id === "rimuovi_sfondo";

  return (
    <button
      type="button"
      onClick={() => onOpen(generation.id)}
      className="flex flex-col gap-1 rounded-md border border-border bg-paper-2 p-1 text-left hover:border-accent"
    >
      <div className={isTransparent ? "overflow-hidden rounded-md bg-checkerboard" : undefined}>
        <img
          src={generation.thumbnail_url ?? thumbnailUrl(generation.id)}
          alt={generation.prompt || "Immagine generata"}
          width={generation.width}
          height={generation.height}
          loading="lazy"
          className="aspect-square w-full rounded-md object-cover"
        />
      </div>
      <span className="line-clamp-2 px-1 text-xs text-ink-muted">
        {generation.prompt || "(senza descrizione)"}
      </span>
      <span className="px-1 text-[11px] text-ink-muted">
        {taskLabel ? `${taskLabel} · ` : ""}
        {formatRelativeTime(generation.created_at)}
      </span>
      {generation.favorite ? (
        <span className="px-1 text-xs text-accent-text">★ Preferito</span>
      ) : null}
    </button>
  );
}
