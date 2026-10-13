import { useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchGenerations, thumbnailUrl } from "@/api/queries";
import { useModalFocus } from "@/hooks/useModalFocus";

interface GalleryReferenceDialogProps {
  /** Generation ids already picked, so they are not offered twice. */
  excludeIds: string[];
  onPick: (generationId: string) => void;
  onClose: () => void;
  /** Dialog title; defaults to the reference-picker wording. */
  title?: string;
  /** Prefix of each thumbnail's accessible name, followed by the image's description. */
  actionLabel?: string;
}

/** Thumbnail grid of recent generations: references on Crea, the source image on Modifica (M2). */
export function GalleryReferenceDialog({
  excludeIds,
  onPick,
  onClose,
  title = "Scegli un'immagine dalla galleria",
  actionLabel = "Usa come riferimento",
}: GalleryReferenceDialogProps) {
  const dialogRef = useRef<HTMLDivElement | null>(null);
  useModalFocus(dialogRef, onClose);

  const generationsQuery = useQuery({
    queryKey: ["generations", "reference-picker"],
    queryFn: () => fetchGenerations({ perPage: 24 }),
  });

  const candidates = (generationsQuery.data?.items ?? []).filter(
    (generation) => !excludeIds.includes(generation.id),
  );

  return (
    <div className="fixed inset-0 z-modal flex items-center justify-center p-4">
      <button
        type="button"
        onClick={onClose}
        aria-label="Annulla"
        className="absolute inset-0 bg-black/60"
      />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="gallery-reference-title"
        tabIndex={-1}
        className="relative flex max-h-[80vh] w-full max-w-lg flex-col gap-3 overflow-y-auto rounded-md border border-border bg-paper p-4"
      >
        <h2 id="gallery-reference-title" className="text-base font-semibold text-ink">
          {title}
        </h2>

        {generationsQuery.isLoading ? <p className="text-sm text-ink-muted">Caricamento...</p> : null}
        {generationsQuery.isError ? (
          <p role="alert" className="text-sm text-danger">
            Impossibile caricare la galleria.
          </p>
        ) : null}
        {!generationsQuery.isLoading && !generationsQuery.isError && candidates.length === 0 ? (
          <p className="text-sm text-ink-muted">Nessuna immagine disponibile in galleria.</p>
        ) : null}

        <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {candidates.map((generation) => (
            <li key={generation.id}>
              <button
                type="button"
                onClick={() => onPick(generation.id)}
                aria-label={`${actionLabel}: ${generation.prompt}`}
                className="block aspect-square w-full overflow-hidden rounded-md border border-border"
              >
                <img
                  src={generation.thumbnail_url ?? thumbnailUrl(generation.id)}
                  alt=""
                  className="h-full w-full object-cover"
                />
              </button>
            </li>
          ))}
        </ul>

        <div className="flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="min-h-11 rounded-md border border-border px-3 py-2 text-sm text-ink"
          >
            Annulla
          </button>
        </div>
      </div>
    </div>
  );
}
