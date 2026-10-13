import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { clearEngineOutput } from "@/api/queries";
import type { ClearEngineOutputResult } from "@/api/types";

/** Two-step confirm before deleting ComfyUI's own output folder (SPEC.md § 5.5). */
export function ClearOutputCard() {
  const [confirming, setConfirming] = useState(false);
  const [result, setResult] = useState<ClearEngineOutputResult | null>(null);

  const mutation = useMutation({
    mutationFn: clearEngineOutput,
    onSuccess: (data) => {
      setResult(data);
      setConfirming(false);
    },
  });

  return (
    <section className="flex flex-col gap-2 rounded-md border border-border bg-paper-2 p-3">
      <h2 className="text-sm font-semibold text-ink">Copie di lavoro del motore</h2>
      <p className="text-sm text-ink-muted">
        Il motore conserva una seconda copia delle immagini che crea. Puoi cancellarle per liberare
        spazio: le tue immagini restano tutte nella Galleria.
      </p>

      {confirming ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-ink">Confermi la cancellazione? Non si può annullare.</span>
          <button
            type="button"
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending}
            className="min-h-11 rounded-md border border-danger px-3 py-2 text-sm text-danger"
          >
            Sì, cancella
          </button>
          <button
            type="button"
            onClick={() => setConfirming(false)}
            className="min-h-11 rounded-md border border-border px-3 py-2 text-sm text-ink-muted"
          >
            Annulla
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="min-h-11 w-fit rounded-md border border-danger px-3 py-2 text-sm text-danger"
        >
          Cancella le copie di lavoro
        </button>
      )}

      {mutation.isError ? (
        <p className="text-sm text-danger">Impossibile cancellare le copie di lavoro.</p>
      ) : null}

      {result ? (
        <p role="status" className="text-sm text-accent-text">
          Rimossi {result.removed_files} file, liberati {result.freed_mb} MB.
        </p>
      ) : null}
    </section>
  );
}
