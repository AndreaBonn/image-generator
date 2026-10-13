import { useEffect, useState } from "react";
import type { JobEvent } from "@/api/types";
import { imageUrl, setFavorite, rerunGeneration } from "@/api/queries";
import { useMutation } from "@tanstack/react-query";
import { Link } from "react-router-dom";

const SLOW_JOB_THRESHOLD_MS = 60_000;

interface ResultAreaProps {
  latestEvent: JobEvent | null;
  generationIds: string[];
  errorMessage: string | null;
  onRetry: () => void;
  onCancel: () => void;
  isRunning: boolean;
  /** Pages that render their own result cards hide the empty placeholder once they have results. */
  hasExternalResults?: boolean;
  /** Live preview URL from useJobEvents (A2); omitted by jobs that emit no preview (upscale, background removal). */
  previewUrl?: string | null;
}

/** Progress, slow-job notice, error with retry, and the results grid (SPEC.md § 11.2-11.3). */
export function ResultArea({
  latestEvent,
  generationIds,
  errorMessage,
  onRetry,
  onCancel,
  isRunning,
  hasExternalResults = false,
  previewUrl = null,
}: ResultAreaProps) {
  const [isSlow, setIsSlow] = useState(false);
  const [displayedPreviewUrl, setDisplayedPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    setIsSlow(false);
    if (!isRunning) return;
    const timer = window.setTimeout(() => setIsSlow(true), SLOW_JOB_THRESHOLD_MS);
    return () => window.clearTimeout(timer);
  }, [isRunning, latestEvent?.type]);

  // Preload the next preview frame before swapping, so the image never flashes blank (A2).
  useEffect(() => {
    if (!previewUrl) {
      setDisplayedPreviewUrl(null);
      return;
    }
    const img = new Image();
    img.onload = () => setDisplayedPreviewUrl(previewUrl);
    img.src = previewUrl;
    return () => {
      img.onload = null;
    };
  }, [previewUrl]);

  const isEmpty = !errorMessage && !isRunning && generationIds.length === 0 && !hasExternalResults;

  return (
    <div className="flex w-full flex-col gap-4 lg:sticky lg:top-4 lg:self-start" aria-live="polite">
      {isEmpty ? (
        <div className="flex min-h-64 items-center justify-center rounded-md border border-dashed border-border bg-paper-2 p-6 text-center">
          <p className="text-sm text-ink-muted">Le immagini generate appariranno qui.</p>
        </div>
      ) : null}

      {errorMessage ? (
        <div className="flex flex-col gap-2 rounded-md border border-danger bg-paper-2 p-3">
          <p className="text-sm text-danger">{errorMessage}</p>
          <button
            type="button"
            onClick={onRetry}
            className="min-h-11 w-fit rounded-md border border-border bg-paper-3 px-3 py-2 text-sm font-medium text-ink"
          >
            Riprova
          </button>
        </div>
      ) : null}

      {isRunning ? (
        <div className="flex flex-col gap-2 rounded-md border border-border bg-paper-2 p-3">
          {displayedPreviewUrl ? (
            <div className="flex flex-col gap-1">
              <img
                src={displayedPreviewUrl}
                alt="Anteprima in corso"
                className="h-auto max-h-[50vh] w-full rounded-md object-contain"
              />
              <p className="text-sm font-medium text-ink">Anteprima in corso</p>
            </div>
          ) : null}
          <ProgressMessage event={latestEvent} />
          {isSlow ? (
            <p className="text-sm text-warning">Ci sta mettendo più del previsto.</p>
          ) : null}
          <button
            type="button"
            onClick={onCancel}
            className="min-h-11 w-fit rounded-md border border-border px-3 py-2 text-sm text-ink-muted"
          >
            Annulla
          </button>
        </div>
      ) : null}

      {generationIds.length > 0 ? <ResultsGrid generationIds={generationIds} /> : null}
    </div>
  );
}

function ProgressMessage({ event }: { event: JobEvent | null }) {
  if (!event) {
    return <p className="text-sm text-ink-muted">In coda...</p>;
  }
  switch (event.type) {
    case "queued":
      return <p className="text-sm text-ink-muted">In coda, posizione {event.position}.</p>;
    case "model_switch":
      return (
        <p className="text-sm text-ink-muted">
          Cambio modello, circa {event.eta_s} secondi.
        </p>
      );
    case "progress":
      return (
        <p className="text-sm text-ink-muted">
          Passo {event.step} di {event.total}.
        </p>
      );
    default:
      return <p className="text-sm text-ink-muted">In corso...</p>;
  }
}

function ResultsGrid({ generationIds }: { generationIds: string[] }) {
  return (
    <div className={`grid gap-3 ${generationIds.length > 1 ? "sm:grid-cols-2" : "grid-cols-1"}`}>
      {generationIds.map((id) => (
        <ResultCard key={id} generationId={id} />
      ))}
    </div>
  );
}

function ResultCard({ generationId }: { generationId: string }) {
  return (
    <figure className="flex flex-col gap-1 rounded-md border border-border bg-paper-2 p-2">
      <img
        src={imageUrl(generationId)}
        alt="Immagine generata"
        className="h-auto max-h-[75vh] w-full rounded-md object-contain"
      />
      <ResultCardActions generationId={generationId} />
    </figure>
  );
}

/**
 * Scarica/preferito/rigenera/modifica for one generation. Exported so other result
 * layouts (e.g. ImprovePage's before/after slider, SPEC.md § 11.2) reuse
 * the same actions instead of duplicating the mutations.
 */
export function ResultCardActions({ generationId }: { generationId: string }) {
  const favoriteMutation = useMutation({
    mutationFn: (favorite: boolean) => setFavorite(generationId, favorite),
  });
  const rerunMutation = useMutation({
    mutationFn: (newSeed: boolean) => rerunGeneration(generationId, newSeed),
  });

  return (
    <div className="flex flex-wrap gap-1">
      <a
        href={imageUrl(generationId)}
        download
        className="inline-flex min-h-11 items-center rounded-md border border-border px-3 text-sm text-ink-muted hover:bg-paper-3"
      >
        Scarica
      </a>
      <button
        type="button"
        onClick={() => favoriteMutation.mutate(true)}
        className="inline-flex min-h-11 items-center rounded-md border border-border px-3 text-sm text-ink-muted hover:bg-paper-3"
      >
        Preferito
      </button>
      <button
        type="button"
        onClick={() => rerunMutation.mutate(true)}
        className="inline-flex min-h-11 items-center rounded-md border border-border px-3 text-sm text-ink-muted hover:bg-paper-3"
      >
        Rigenera
      </button>
      <Link
        to={`/modifica?source=${generationId}&mode=modifica_libera`}
        className="inline-flex min-h-11 items-center rounded-md border border-border px-3 text-sm text-ink-muted hover:bg-paper-3"
      >
        Modifica con le parole
      </Link>
    </div>
  );
}
