import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import type { GenerationSummary } from "@/api/types";
import { imageUrl, setFavorite, thumbnailUrl } from "@/api/queries";
import { formatRelativeTime } from "@/lib/format";

const QUICK_ACTION_CLASS =
  "flex h-11 w-11 items-center justify-center rounded-md border border-border bg-paper/90 text-base text-ink hover:bg-paper-3";

interface GenerationCardProps {
  generation: GenerationSummary;
  /** Plain name of the task that made it, e.g. "Foto realistica" (G1); omitted when the catalog is not loaded. */
  taskLabel?: string;
  onOpen: (id: string) => void;
}

/**
 * One gallery thumbnail; opens the detail panel on click (SPEC.md § 11.2), with
 * favorite, download and edit as quick actions on top (G2).
 * "Rimuovi lo sfondo" results are transparent PNGs (thumbnail keeps alpha):
 * shown on a checkerboard so the transparency is visible at a glance.
 */
export function GenerationCard({ generation, taskLabel, onOpen }: GenerationCardProps) {
  const isTransparent = generation.task_id === "rimuovi_sfondo";
  const description = generation.prompt || "Immagine generata";

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => onOpen(generation.id)}
        aria-label={`Apri: ${description}`}
        className="flex w-full flex-col gap-1 rounded-md border border-border bg-paper-2 p-1 text-left hover:border-accent"
      >
        <div className={isTransparent ? "overflow-hidden rounded-md bg-checkerboard" : undefined}>
          <img
            src={generation.thumbnail_url ?? thumbnailUrl(generation.id)}
            alt={description}
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
      <QuickActions generation={generation} />
    </div>
  );
}

function QuickActions({ generation }: { generation: GenerationSummary }) {
  const queryClient = useQueryClient();
  const favoriteMutation = useMutation({
    mutationFn: (favorite: boolean) => setFavorite(generation.id, favorite),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["generations"] }),
  });

  return (
    <div role="group" aria-label="Azioni rapide" className="absolute right-2 top-2 flex gap-1">
      <button
        type="button"
        aria-label={generation.favorite ? "Rimuovi dai preferiti" : "Aggiungi ai preferiti"}
        aria-pressed={generation.favorite}
        disabled={favoriteMutation.isPending}
        onClick={() => favoriteMutation.mutate(!generation.favorite)}
        className={QUICK_ACTION_CLASS}
      >
        <span aria-hidden="true">{generation.favorite ? "★" : "☆"}</span>
      </button>
      <a href={imageUrl(generation.id)} download aria-label="Scarica" className={QUICK_ACTION_CLASS}>
        <span aria-hidden="true">⤓</span>
      </a>
      <Link to={`/modifica?source=${generation.id}`} aria-label="Modifica" className={QUICK_ACTION_CLASS}>
        <span aria-hidden="true">✎</span>
      </Link>
    </div>
  );
}
