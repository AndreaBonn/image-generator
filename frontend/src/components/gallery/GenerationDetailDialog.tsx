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

interface GenerationDetailDialogProps {
  generationId: string;
  onClose: () => void;
  onOpenGeneration: (id: string) => void;
}

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Accessible modal with the full record for one generation (SPEC.md § 11.2).
 * Traps Tab focus inside the dialog, closes on Escape, and restores focus
 * to the element that opened it when the dialog unmounts.
 */
export function GenerationDetailDialog({
  generationId,
  onClose,
  onOpenGeneration,
}: GenerationDetailDialogProps) {
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);
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

  useEffect(() => {
    previouslyFocused.current = document.activeElement as HTMLElement | null;
    dialogRef.current?.focus();
    return () => {
      previouslyFocused.current?.focus();
    };
  }, []);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab" || !dialogRef.current) return;

      const focusable = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const favoriteMutation = useMutation({
    mutationFn: (favorite: boolean) => setFavorite(generationId, favorite),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["generation", generationId] });
      queryClient.invalidateQueries({ queryKey: ["generations"] });
    },
  });

  const rerunMutation = useMutation({
    mutationFn: (newSeed: boolean) => rerunGeneration(generationId, newSeed),
    onSuccess: () => setRerunDone(true),
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
            <img
              src={imageUrl(detail.id)}
              alt={detail.prompt || "Immagine generata"}
              className="max-h-[50vh] w-full rounded-md object-contain"
            />

            <dl className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
              <DetailRow label="Prompt" value={detail.prompt || "(vuoto)"} />
              <DetailRow label="Prompt finale" value={detail.prompt_final || "(vuoto)"} />
              <DetailRow label="Seed" value={String(detail.seed)} />
              <DetailRow label="Modello" value={detail.model_ids.join(", ") || "-"} />
              <DetailRow label="Dimensioni" value={`${detail.width}×${detail.height} px`} />
              <DetailRow
                label="Durata"
                value={detail.duration_ms !== null ? `${(detail.duration_ms / 1000).toFixed(1)} s` : "-"}
              />
            </dl>

            {detail.parent_id ? (
              <button
                type="button"
                onClick={() => detail.parent_id && onOpenGeneration(detail.parent_id)}
                className="min-h-11 w-fit text-sm text-accent-text underline"
              >
                Vedi immagine di origine
              </button>
            ) : null}

            <div className="flex flex-wrap gap-2">
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
              <button
                type="button"
                onClick={() => rerunMutation.mutate(true)}
                disabled={rerunMutation.isPending}
                className="min-h-11 rounded-md border border-border px-3 py-2 text-sm text-ink"
              >
                Rigenera
              </button>
              <Link
                to={`/modifica?source=${detail.id}`}
                className="min-h-11 rounded-md border border-border px-3 py-2 text-sm text-ink"
              >
                Modifica
              </Link>
              <Link
                to={`/migliora?source=${detail.id}`}
                className="min-h-11 rounded-md border border-border px-3 py-2 text-sm text-ink"
              >
                Migliora
              </Link>

              {confirmingDelete ? (
                <span className="flex items-center gap-2 text-sm">
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

            {rerunDone ? (
              <p role="status" className="text-sm text-accent-text">
                Nuova generazione avviata. Segui l'avanzamento nella pagina Crea.
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
