import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import {
  deleteGeneration,
  fetchGeneration,
  imageUrl,
  rerunGeneration,
  setFavorite,
} from "@/api/queries";
import { useModalFocus } from "@/hooks/useModalFocus";
import { formatRelativeTime } from "@/lib/format";

interface GenerationDetailDialogProps {
  generationId: string;
  onClose: () => void;
  onOpenGeneration: (id: string) => void;
  /** task_id → plain task name, for the "made with" line (G4). */
  taskLabels?: ReadonlyMap<string, string>;
  /** Hands the new job to the page, which follows it after the dialog closes (G6). */
  onRerunStarted?: (jobId: string) => void;
}

/**
 * Accessible modal with the full record for one generation (SPEC.md § 11.2).
 * Traps Tab focus inside the dialog, closes on Escape, and restores focus
 * to the element that opened it when the dialog unmounts.
 */
export function GenerationDetailDialog({
  generationId,
  onClose,
  onOpenGeneration,
  taskLabels,
  onRerunStarted,
}: GenerationDetailDialogProps) {
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [rerunDone, setRerunDone] = useState(false);
  const queryClient = useQueryClient();

  const detailQuery = useQuery({
    queryKey: ["generation", generationId],
    queryFn: ({ signal }) => fetchGeneration(generationId, signal),
  });

  useEffect(() => {
    setConfirmingDelete(false);
    setRerunDone(false);
  }, [generationId]);

  useModalFocus(dialogRef, onClose);

  const favoriteMutation = useMutation({
    mutationFn: (favorite: boolean) => setFavorite(generationId, favorite),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["generation", generationId] });
      queryClient.invalidateQueries({ queryKey: ["generations"] });
    },
  });

  const rerunMutation = useMutation({
    mutationFn: (newSeed: boolean) => rerunGeneration(generationId, newSeed),
    onSuccess: (response) => {
      setRerunDone(true);
      onRerunStarted?.(response.job_id);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteGeneration(generationId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["generations"] });
      onClose();
    },
  });

  const detail = detailQuery.data;

  return (
    <div className="fixed inset-0 z-modal flex items-center justify-center p-4">
      <button
        type="button"
        onClick={onClose}
        aria-label="Chiudi il dettaglio"
        className="absolute inset-0 bg-black/60"
      />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Dettaglio immagine"
        tabIndex={-1}
        className="relative flex max-h-[90vh] w-full max-w-3xl flex-col gap-3 overflow-y-auto rounded-md border border-border bg-paper p-4"
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-ink">Dettaglio immagine</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Chiudi"
            className="min-h-11 min-w-11 rounded-md border border-border px-2 text-ink-muted"
          >
            ✕
          </button>
        </div>

        {detailQuery.isLoading ? <p className="text-ink-muted">Caricamento...</p> : null}

        {detailQuery.isError ? (
          <div className="flex flex-col gap-2">
            <p className="text-danger">Impossibile caricare il dettaglio.</p>
            <button
              type="button"
              onClick={() => detailQuery.refetch()}
              className="min-h-11 w-fit rounded-md border border-border px-3 py-2 text-sm text-ink"
            >
              Riprova
            </button>
          </div>
        ) : null}

        {detail ? (
          <>
            <div
              className={
                detail.task_id === "rimuovi_sfondo" ? "overflow-hidden rounded-md bg-checkerboard" : undefined
              }
            >
              <img
                src={imageUrl(detail.id)}
                alt={detail.prompt || "Immagine generata"}
                className="max-h-[50vh] w-full rounded-md object-contain"
              />
            </div>

            <dl className="flex flex-col gap-2 text-sm">
              <DetailRow label="Descrizione" value={detail.prompt || "(vuoto)"} />
            </dl>
            <p className="text-sm text-ink-muted">
              {[
                taskLabels?.get(detail.task_id),
                `${detail.width}×${detail.height} px`,
                formatRelativeTime(detail.created_at),
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
            <details className="text-sm">
              <summary className="min-h-11 cursor-pointer py-2 text-ink-muted">Dettagli tecnici</summary>
              <dl className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <DetailRow label="Descrizione completa" value={detail.prompt_final || "(vuoto)"} />
                <DetailRow label="Codice del risultato" value={String(detail.seed)} />
                <DetailRow label="Modello" value={detail.model_ids.join(", ") || "-"} />
                <DetailRow
                  label="Durata"
                  value={detail.duration_ms !== null ? `${(detail.duration_ms / 1000).toFixed(1)} s` : "-"}
                />
              </dl>
            </details>

            {detail.parent_id ? (
              <button
                type="button"
                onClick={() => detail.parent_id && onOpenGeneration(detail.parent_id)}
                className="min-h-11 w-fit text-sm text-accent-text underline"
              >
                Vedi immagine di origine
              </button>
            ) : null}

            <div role="group" aria-label="Continua da qui" className="flex flex-col gap-1">
              <p aria-hidden="true" className="text-xs font-semibold text-ink-muted">
                Continua da qui
              </p>
              <div className="flex flex-wrap gap-2">
                <Link
                  to={`/modifica?source=${detail.id}`}
                  className="min-h-11 rounded-md bg-accent px-3 py-2 text-sm font-semibold text-accent-ink"
                >
                  Modifica
                </Link>
                <Link
                  to={`/migliora?source=${detail.id}`}
                  className="min-h-11 rounded-md border border-border px-3 py-2 text-sm text-ink"
                >
                  Migliora
                </Link>
                <button
                  type="button"
                  onClick={() => rerunMutation.mutate(true)}
                  disabled={rerunMutation.isPending}
                  className="min-h-11 rounded-md border border-border px-3 py-2 text-sm text-ink"
                >
                  Un&apos;altra variante
                </button>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
              <a
                href={imageUrl(detail.id)}
                download
                className="min-h-11 rounded-md border border-border px-3 py-2 text-sm text-ink"
              >
                Scarica
              </a>
              <button
                type="button"
                onClick={() => favoriteMutation.mutate(!detail.favorite)}
                disabled={favoriteMutation.isPending}
                aria-pressed={detail.favorite}
                className="min-h-11 rounded-md border border-border px-3 py-2 text-sm text-ink"
              >
                {detail.favorite ? "Rimuovi dai preferiti" : "Aggiungi ai preferiti"}
              </button>

              <div className="ml-auto">
                {confirmingDelete ? (
                  <span className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="text-ink">Eliminare questa immagine?</span>
                    <button
                      type="button"
                      onClick={() => deleteMutation.mutate()}
                      disabled={deleteMutation.isPending}
                      className="min-h-11 rounded-md border border-danger px-3 py-2 text-danger"
                    >
                      Sì, elimina
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmingDelete(false)}
                      className="min-h-11 rounded-md border border-border px-3 py-2 text-ink-muted"
                    >
                      Annulla
                    </button>
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmingDelete(true)}
                    className="min-h-11 rounded-md border border-danger px-3 py-2 text-sm text-danger"
                  >
                    Elimina
                  </button>
                )}
              </div>
            </div>

            {rerunDone ? (
              <p role="status" className="text-sm text-accent-text">
                Nuova variante in preparazione: comparirà in cima alla Galleria appena pronta.
              </p>
            ) : null}
            {deleteMutation.isError ? (
              <p className="text-sm text-danger">Impossibile eliminare l'immagine.</p>
            ) : null}
          </>
        ) : null}
      </div>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col">
      <dt className="text-xs font-medium text-ink-muted">{label}</dt>
      <dd className="text-ink">{value}</dd>
    </div>
  );
}
