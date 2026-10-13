import { ApiError } from "@/api/errors";
import type { AssetGeneration, AssetKind } from "@/api/types";
import { useAssetGeneration } from "@/hooks/useAssetGeneration";

const KIND_TEXT: Record<AssetKind, { label: string; of: string }> = {
  examples: { label: "Esempi", of: "degli esempi" },
  styles: { label: "Anteprime degli stili", of: "delle anteprime degli stili" },
};

const BUTTON_CLASS =
  "min-h-11 rounded-md border border-border px-3 py-2 text-sm text-ink hover:bg-paper-3 disabled:cursor-not-allowed disabled:opacity-50";

/** I4: create the missing examples and style previews from here, without a terminal. */
export function AssetGenerationPanel() {
  const { generation, start, cancel } = useAssetGeneration();
  const isRunning = generation?.status === "running" || start.isPending;
  const startError = start.error instanceof ApiError ? start.error.message : start.error ? "Avvio non riuscito." : null;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
        <StartButton
          label="Crea gli esempi mancanti"
          hint="Pochi minuti."
          disabled={isRunning}
          onClick={() => start.mutate("examples")}
        />
        <StartButton
          label="Crea le anteprime degli stili mancanti"
          hint="Circa un'ora se mancano tutte. Intanto puoi generare: i tuoi lavori passano fra un'anteprima e l'altra."
          disabled={isRunning}
          onClick={() => start.mutate("styles")}
        />
      </div>
      {startError ? <p className="text-sm text-danger">{startError}</p> : null}
      {generation ? (
        <GenerationStatus generation={generation} onCancel={() => cancel.mutate()} cancelling={cancel.isPending} />
      ) : null}
    </div>
  );
}

function StartButton({
  label,
  hint,
  disabled,
  onClick,
}: {
  label: string;
  hint: string;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1 sm:max-w-xs">
      <button type="button" disabled={disabled} onClick={onClick} className={BUTTON_CLASS}>
        {label}
      </button>
      <p className="text-xs text-ink-muted">{hint}</p>
    </div>
  );
}

function GenerationStatus({
  generation,
  onCancel,
  cancelling,
}: {
  generation: AssetGeneration;
  onCancel: () => void;
  cancelling: boolean;
}) {
  if (generation.kind === null || generation.status === "idle") return null;
  const { label, of } = KIND_TEXT[generation.kind];
  const { status, done, total, message } = generation;

  if (status === "running") {
    const text = total > 0 ? `${label}: ${done} di ${total}` : `${label}: preparazione...`;
    return (
      <div role="status" className="flex flex-col gap-2">
        <p className="text-sm text-ink">{text}</p>
        <div className="flex flex-wrap items-center gap-3">
          <progress value={done} max={Math.max(total, 1)} aria-label={text} className="h-2 w-full max-w-sm accent-accent" />
          <button type="button" onClick={onCancel} disabled={cancelling} className={BUTTON_CLASS}>
            Annulla
          </button>
        </div>
      </div>
    );
  }
  if (status === "completed") {
    const text = total > 0 ? `${label}: ${done} immagini create.` : `${label}: c'era già tutto.`;
    return <p role="status" className="text-sm text-ink">{text}</p>;
  }
  if (status === "cancelled") {
    return (
      <p role="status" className="text-sm text-ink-muted">
        Creazione {of} annullata: le {done} immagini già pronte restano.
      </p>
    );
  }
  return (
    <p role="alert" className="text-sm text-danger">
      Creazione {of} interrotta: {message ?? "errore imprevisto."}
    </p>
  );
}
