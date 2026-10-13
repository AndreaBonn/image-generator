import { useState } from "react";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { emptyTrash, fetchGenerations, fetchTrashSummary, restoreGeneration, thumbnailUrl } from "@/api/queries";
import { formatBytes } from "@/lib/format";
import { InfoTip } from "@/components/ui/InfoTip";
import { HELP_TEXTS } from "@/lib/helpTexts";
import { EmptyTrashDialog } from "@/components/gallery/EmptyTrashDialog";
import type { GenerationSummary } from "@/api/types";

const PER_PAGE = 24;

/** Trashed items: restore one by one, or empty the trash entirely (A4). */
export function TrashView() {
  const queryClient = useQueryClient();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [freedMessage, setFreedMessage] = useState<string | null>(null);

  const trashQuery = useInfiniteQuery({
    queryKey: ["generations-trash"],
    queryFn: ({ pageParam }) => fetchGenerations({ page: pageParam, perPage: PER_PAGE, trashed: true }),
    initialPageParam: 1,
    getNextPageParam: (lastPage) =>
      lastPage.meta.page < lastPage.meta.total_pages ? lastPage.meta.page + 1 : undefined,
  });

  const summaryQuery = useQuery({
    queryKey: ["trash-summary"],
    queryFn: ({ signal }) => fetchTrashSummary(signal),
  });

  const restoreMutation = useMutation({
    mutationFn: (id: string) => restoreGeneration(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["generations-trash"] });
      queryClient.invalidateQueries({ queryKey: ["trash-summary"] });
      queryClient.invalidateQueries({ queryKey: ["generations"] });
    },
  });

  const emptyMutation = useMutation({
    mutationFn: () => emptyTrash(),
    onSuccess: (result) => {
      setFreedMessage(`Liberati ${formatBytes(result.freed_bytes)}.`);
      setConfirmOpen(false);
      queryClient.invalidateQueries({ queryKey: ["generations-trash"] });
      queryClient.invalidateQueries({ queryKey: ["trash-summary"] });
    },
  });

  const items = trashQuery.data?.pages.flatMap((page) => page.items) ?? [];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="flex items-center gap-1 text-sm text-ink-muted">
          {summaryQuery.data
            ? `${summaryQuery.data.count} ${summaryQuery.data.count === 1 ? "immagine" : "immagini"}, ${formatBytes(summaryQuery.data.bytes)}`
            : "Caricamento del cestino..."}
          <InfoTip text={HELP_TEXTS.trashEmpty} label="Informazioni: Svuota il cestino" />
        </span>
        {items.length > 0 ? (
          <button
            type="button"
            onClick={() => setConfirmOpen(true)}
            className="min-h-11 rounded-md border border-danger px-3 py-2 text-sm font-medium text-danger"
          >
            Svuota il cestino
          </button>
        ) : null}
      </div>

      {freedMessage ? <p role="status" className="text-sm text-ink">{freedMessage}</p> : null}

      {trashQuery.isLoading ? <p className="text-ink-muted">Caricamento immagini eliminate...</p> : null}

      {trashQuery.isError ? (
        <div className="flex flex-col gap-2">
          <p className="text-danger">Impossibile caricare il cestino.</p>
          <button
            type="button"
            onClick={() => trashQuery.refetch()}
            className="min-h-11 w-fit rounded-md border border-border px-3 py-2 text-sm text-ink"
          >
            Riprova
          </button>
        </div>
      ) : null}

      {trashQuery.isSuccess && items.length === 0 ? (
        <p className="text-ink-muted">Il cestino è vuoto.</p>
      ) : null}

      {items.length > 0 ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
          {items.map((item) => (
            <TrashCard
              key={item.id}
              generation={item}
              isRestoring={restoreMutation.isPending && restoreMutation.variables === item.id}
              onRestore={() => restoreMutation.mutate(item.id)}
            />
          ))}
        </div>
      ) : null}

      {trashQuery.hasNextPage ? (
        <button
          type="button"
          onClick={() => trashQuery.fetchNextPage()}
          disabled={trashQuery.isFetchingNextPage}
          className="min-h-11 w-fit rounded-md border border-border px-3 py-2 text-sm text-ink"
        >
          {trashQuery.isFetchingNextPage ? "Caricamento..." : "Carica altre immagini"}
        </button>
      ) : null}

      {confirmOpen ? (
        <EmptyTrashDialog
          count={summaryQuery.data?.count ?? items.length}
          bytes={summaryQuery.data?.bytes ?? 0}
          isPending={emptyMutation.isPending}
          onConfirm={() => emptyMutation.mutate()}
          onCancel={() => setConfirmOpen(false)}
        />
      ) : null}
    </div>
  );
}

function TrashCard({
  generation,
  isRestoring,
  onRestore,
}: {
  generation: GenerationSummary;
  isRestoring: boolean;
  onRestore: () => void;
}) {
  return (
    <figure className="flex flex-col gap-1 rounded-md border border-border bg-paper-2 p-1">
      <div
        className={
          generation.task_id === "rimuovi_sfondo" ? "overflow-hidden rounded-md bg-checkerboard" : undefined
        }
      >
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
      <button
        type="button"
        onClick={onRestore}
        disabled={isRestoring}
        className="min-h-11 rounded-md border border-border px-2 py-1 text-xs font-medium text-ink hover:bg-paper-3 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isRestoring ? "Ripristino..." : "Ripristina"}
      </button>
    </figure>
  );
}
