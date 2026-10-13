export type GalleryKind = "" | "crea" | "modifica" | "migliora";

const KINDS: { id: GalleryKind; label: string }[] = [
  { id: "", label: "Tutte" },
  { id: "crea", label: "Create" },
  { id: "modifica", label: "Modificate" },
  { id: "migliora", label: "Migliorate" },
];
const CHIP_CLASS = "min-h-11 rounded-full border px-4 py-1 text-sm";
const CHIP_ON = "border-accent bg-paper-3 font-semibold text-ink";
const CHIP_OFF = "border-border bg-paper-2 text-ink-muted hover:bg-paper-3";

interface GalleryFiltersProps {
  kind: GalleryKind;
  onKindChange: (value: GalleryKind) => void;
  favoriteOnly: boolean;
  onFavoriteOnlyChange: (value: boolean) => void;
  searchInput: string;
  onSearchInputChange: (value: string) => void;
}

/** Full-width search plus quick filters by kind of work and favorites (G3, SPEC.md § 11.2). */
export function GalleryFilters({
  kind,
  onKindChange,
  favoriteOnly,
  onFavoriteOnlyChange,
  searchInput,
  onSearchInputChange,
}: GalleryFiltersProps) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1 text-sm text-ink">
        <label htmlFor="gallery-search-input">Cerca nella descrizione</label>
        <input
          id="gallery-search-input"
          type="search"
          value={searchInput}
          onChange={(event) => onSearchInputChange(event.target.value)}
          placeholder="Cerca fra le descrizioni (es. mare, faro, gatto)"
          className="min-h-11 w-full rounded-md border border-border bg-paper-2 px-3 py-1 text-ink"
        />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <div role="group" aria-label="Tipo di lavoro" className="flex flex-wrap gap-2">
          {KINDS.map((item) => (
            <button
              key={item.id || "tutte"}
              type="button"
              aria-pressed={kind === item.id}
              onClick={() => onKindChange(item.id)}
              className={`${CHIP_CLASS} ${kind === item.id ? CHIP_ON : CHIP_OFF}`}
            >
              {item.label}
            </button>
          ))}
        </div>
        <button
          type="button"
          aria-pressed={favoriteOnly}
          onClick={() => onFavoriteOnlyChange(!favoriteOnly)}
          className={`${CHIP_CLASS} ${favoriteOnly ? CHIP_ON : CHIP_OFF}`}
        >
          ★ Preferite
        </button>
      </div>
    </div>
  );
}
