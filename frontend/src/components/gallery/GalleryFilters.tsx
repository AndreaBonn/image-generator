import type { Task } from "@/api/types";
import { InfoTip } from "@/components/ui/InfoTip";
import { HELP_TEXTS } from "@/lib/helpTexts";

interface GalleryFiltersProps {
  tasks: Task[];
  taskId: string;
  onTaskIdChange: (value: string) => void;
  favoriteOnly: boolean;
  onFavoriteOnlyChange: (value: boolean) => void;
  searchInput: string;
  onSearchInputChange: (value: string) => void;
}

/** Task filter, favorite toggle and prompt search for the gallery (SPEC.md § 11.2). */
export function GalleryFilters({
  tasks,
  taskId,
  onTaskIdChange,
  favoriteOnly,
  onFavoriteOnlyChange,
  searchInput,
  onSearchInputChange,
}: GalleryFiltersProps) {
  return (
    <div className="flex flex-wrap items-end gap-3">
      <label className="flex w-full flex-col gap-1 text-sm text-ink sm:w-auto">
        Compito
        <select
          value={taskId}
          onChange={(event) => onTaskIdChange(event.target.value)}
          className="min-h-11 w-full max-w-full rounded-md border border-border bg-paper-2 px-2 py-1 text-ink"
        >
          <option value="">Tutti i compiti</option>
          {tasks.map((task) => (
            <option key={task.id} value={task.id}>
              {task.label}
            </option>
          ))}
        </select>
      </label>

      <label className="flex min-h-11 items-center gap-2 text-sm text-ink-muted">
        <input
          type="checkbox"
          checked={favoriteOnly}
          onChange={(event) => onFavoriteOnlyChange(event.target.checked)}
        />
        Solo preferiti
      </label>

      <div className="flex w-full flex-1 flex-col gap-1 text-sm text-ink sm:w-auto sm:min-w-48">
        <span className="flex items-center gap-1">
          <label htmlFor="gallery-search-input">Cerca nella descrizione</label>
          <InfoTip text={HELP_TEXTS.gallerySearch} label="Informazioni: Cerca nella descrizione" />
        </span>
        <input
          id="gallery-search-input"
          type="search"
          value={searchInput}
          onChange={(event) => onSearchInputChange(event.target.value)}
          placeholder="Cerca..."
          className="min-h-11 rounded-md border border-border bg-paper-2 px-2 py-1 text-ink"
        />
      </div>
    </div>
  );
}
