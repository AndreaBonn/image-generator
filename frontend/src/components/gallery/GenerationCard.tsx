import type { GenerationSummary } from "@/api/types";
import { thumbnailUrl } from "@/api/queries";

interface GenerationCardProps {
  generation: GenerationSummary;
  onOpen: (id: string) => void;
}

/** One gallery thumbnail; opens the detail panel on click (SPEC.md § 11.2). */
export function GenerationCard({ generation, onOpen }: GenerationCardProps) {
  return (
    <button
      type="button"
      onClick={() => onOpen(generation.id)}
      className="flex flex-col gap-1 rounded-md border border-border bg-paper-2 p-1 text-left hover:border-accent"
    >
      <img
        src={generation.thumbnail_url ?? thumbnailUrl(generation.id)}
        alt={generation.prompt || "Immagine generata"}
        width={generation.width}
        height={generation.height}
        loading="lazy"
        className="aspect-square w-full rounded-md object-cover"
      />
      <span className="line-clamp-2 px-1 text-xs text-ink-muted">
        {generation.prompt || "(senza prompt)"}
      </span>
      {generation.favorite ? (
        <span className="px-1 text-xs text-accent-text">★ Preferito</span>
      ) : null}
    </button>
  );
}
