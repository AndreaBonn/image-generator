import { useState } from "react";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router-dom";
import { fetchGenerations, fetchTasks } from "@/api/queries";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { GalleryFilters } from "@/components/gallery/GalleryFilters";
import { GenerationGrid } from "@/components/gallery/GenerationGrid";
import { GenerationDetailDialog } from "@/components/gallery/GenerationDetailDialog";
import { TrashView } from "@/components/gallery/TrashView";
import { TabList, type TabItem } from "@/components/ui/TabList";
import { PageTitle } from "@/components/layout/PageTitle";

const PER_PAGE = 24;
const GALLERY_VIEWS: TabItem<"galleria" | "cestino">[] = [
  { id: "galleria", label: "Galleria" },
  { id: "cestino", label: "Cestino" },
];
const SEARCH_DEBOUNCE_MS = 300;

/** Gallery: thumbnail grid with filters, infinite scroll, a detail panel and the trash (SPEC.md § 11.2, A4). */
export function GalleryPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const isTrashView = searchParams.get("view") === "cestino";
  const [taskId, setTaskId] = useState("");
  const [favoriteOnly, setFavoriteOnly] = useState(false);
  const [searchInput, setSearchInput] = useState("");
  const [selectedGenerationId, setSelectedGenerationId] = useState<string | null>(null);
  const debouncedQuery = useDebouncedValue(searchInput, SEARCH_DEBOUNCE_MS).trim();

  const tasksQuery = useQuery({ queryKey: ["tasks"], queryFn: ({ signal }) => fetchTasks(signal) });

  const generationsQuery = useInfiniteQuery({
    queryKey: ["generations", taskId, debouncedQuery, favoriteOnly],
    queryFn: ({ pageParam }) =>
      fetchGenerations({
        page: pageParam,
        perPage: PER_PAGE,
        taskId: taskId || undefined,
        query: debouncedQuery || undefined,
        favorite: favoriteOnly || undefined,
      }),
    initialPageParam: 1,
    getNextPageParam: (lastPage) =>
      lastPage.meta.page < lastPage.meta.total_pages ? lastPage.meta.page + 1 : undefined,
  });

  const items = generationsQuery.data?.pages.flatMap((page) => page.items) ?? [];
  const taskLabels = new Map((tasksQuery.data ?? []).map((task) => [task.id, task.label]));
  const hasFilters = taskId !== "" || favoriteOnly || debouncedQuery !== "";

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <PageTitle>Galleria</PageTitle>
        <TabList
          label="Vista galleria"
          items={GALLERY_VIEWS}
          selected={isTrashView ? "cestino" : "galleria"}
          onSelect={(view) => setSearchParams(view === "cestino" ? { view: "cestino" } : {})}
        />
      </div>

      {isTrashView ? (
        <TrashView />
      ) : (
        <>
          <GalleryFilters
            tasks={tasksQuery.data ?? []}
            taskId={taskId}
            onTaskIdChange={setTaskId}
            favoriteOnly={favoriteOnly}
            onFavoriteOnlyChange={setFavoriteOnly}
            searchInput={searchInput}
            onSearchInputChange={setSearchInput}
          />

          {generationsQuery.isLoading ? (
            <>
              <p className="text-ink-muted">Caricamento immagini...</p>
              <GallerySkeleton />
            </>
          ) : null}

          {generationsQuery.isError ? (
            <div className="flex flex-col gap-2">
              <p className="text-danger">Impossibile caricare la galleria.</p>
              <button
                type="button"
                onClick={() => generationsQuery.refetch()}
                className="min-h-11 w-fit rounded-md border border-border px-3 py-2 text-sm text-ink"
              >
                Riprova
              </button>
            </div>
          ) : null}

          {generationsQuery.isSuccess && items.length === 0 ? (
            hasFilters ? (
              <p className="text-ink-muted">
                Nessuna immagine trovata per questa ricerca. Prova a cambiare i filtri.
              </p>
            ) : (
              <div className="flex flex-col items-start gap-2">
                <p className="text-ink-muted">
                  Non hai ancora generato nessuna immagine. Inizia dalla pagina Crea.
                </p>
                <Link
                  to="/"
                  className="min-h-11 rounded-md bg-accent px-4 py-2 text-sm font-semibold text-accent-ink"
                >
                  Vai a Crea
                </Link>
              </div>
            )
          ) : null}

          {items.length > 0 ? (
            <GenerationGrid
              items={items}
              taskLabels={taskLabels}
              onOpen={setSelectedGenerationId}
              hasNextPage={generationsQuery.hasNextPage}
              isFetchingNextPage={generationsQuery.isFetchingNextPage}
              onLoadMore={() => generationsQuery.fetchNextPage()}
            />
          ) : null}

          {selectedGenerationId ? (
            <GenerationDetailDialog
              generationId={selectedGenerationId}
              onClose={() => setSelectedGenerationId(null)}
              onOpenGeneration={setSelectedGenerationId}
            />
          ) : null}
        </>
      )}
    </div>
  );
}

function GallerySkeleton() {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6" aria-hidden="true">
      {Array.from({ length: PER_PAGE / 2 }).map((_, index) => (
        <div key={index} className="aspect-square animate-pulse rounded-md bg-paper-2" />
      ))}
    </div>
  );
}
