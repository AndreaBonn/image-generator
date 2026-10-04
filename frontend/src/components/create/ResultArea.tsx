import { useEffect, useState } from "react";
import type { JobEvent } from "@/api/types";
import { imageUrl, setFavorite, rerunGeneration } from "@/api/queries";
import { useMutation } from "@tanstack/react-query";

const SLOW_JOB_THRESHOLD_MS = 60_000;

interface ResultAreaProps {
  latestEvent: JobEvent | null;
  generationIds: string[];
  errorMessage: string | null;
  onRetry: () => void;
  onCancel: () => void;
  isRunning: boolean;
}

/** Progress, slow-job notice, error with retry, and the results grid (SPEC.md § 11.2-11.3). */
export function ResultArea({
  latestEvent,
  generationIds,
  errorMessage,
  onRetry,
  onCancel,
  isRunning,
}: ResultAreaProps) {
  const [isSlow, setIsSlow] = useState(false);

  useEffect(() => {
    setIsSlow(false);
    if (!isRunning) return;
    const timer = window.setTimeout(() => setIsSlow(true), SLOW_JOB_THRESHOLD_MS);
    return () => window.clearTimeout(timer);
  }, [isRunning, latestEvent?.type]);

  return (
    <div className="flex flex-col gap-4" aria-live="polite">
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
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {generationIds.map((id) => (
        <ResultCard key={id} generationId={id} />
      ))}
    </div>
  );
}

function ResultCard({ generationId }: { generationId: string }) {
  const favoriteMutation = useMutation({
    mutationFn: (favorite: boolean) => setFavorite(generationId, favorite),
  });
  const rerunMutation = useMutation({
    mutationFn: (newSeed: boolean) => rerunGeneration(generationId, newSeed),
  });

  return (
    <figure className="flex flex-col gap-1 rounded-md border border-border bg-paper-2 p-2">
      <img
        src={imageUrl(generationId)}
        alt="Immagine generata"
        className="aspect-square w-full rounded-md object-cover"
      />
      <div className="flex flex-wrap gap-1">
        <a
          href={imageUrl(generationId)}
          download
          className="min-h-11 rounded-md border border-border px-2 py-1 text-xs text-ink-muted"
        >
          Scarica
        </a>
        <button
          type="button"
          onClick={() => favoriteMutation.mutate(true)}
          className="min-h-11 rounded-md border border-border px-2 py-1 text-xs text-ink-muted"
        >
          Preferito
        </button>
        <button
          type="button"
          onClick={() => rerunMutation.mutate(true)}
          className="min-h-11 rounded-md border border-border px-2 py-1 text-xs text-ink-muted"
        >
          Rigenera
        </button>
      </div>
    </figure>
  );
}
