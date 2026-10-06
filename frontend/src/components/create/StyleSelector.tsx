import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchStyles } from "@/api/queries";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { pickVisibleStyles } from "@/lib/styles";
import { InfoTip } from "@/components/ui/InfoTip";
import { HELP_TEXTS } from "@/lib/helpTexts";

const MAX_STYLES = 5;
const CHIP_CLASS = "flex min-h-11 items-center gap-1.5 rounded-md border px-3 py-2 text-xs font-medium";
const CARD_CLASS =
  "flex min-h-11 flex-col items-center gap-1 rounded-md border border-border bg-paper-2 p-2 text-center text-ink-muted hover:bg-paper-3 disabled:cursor-not-allowed disabled:opacity-50";

interface StyleSelectorProps {
  selected: string[];
  onChange: (styleIds: string[]) => void;
}

/**
 * Fixed-size thumbnail, or a same-size neutral placeholder so no style shifts the grid.
 * "sm" is the selected-style chip (28px); "lg" is the browsable grid card (96px, O9).
 */
function StyleThumbnail({
  previewUrl,
  label,
  size,
}: {
  previewUrl: string | null | undefined;
  label: string;
  size: "sm" | "lg";
}) {
  const dimension = size === "lg" ? 96 : 28;
  const boxClass = size === "lg" ? "h-24 w-24" : "h-7 w-7";
  if (previewUrl) {
    return (
      <img
        src={previewUrl}
        alt=""
        width={dimension}
        height={dimension}
        loading="lazy"
        className={`${boxClass} shrink-0 rounded-sm object-cover`}
      />
    );
  }
  return (
    <span
      aria-hidden="true"
      className={`flex ${boxClass} shrink-0 items-center justify-center rounded-sm bg-paper-3 font-semibold text-ink-muted ${
        size === "lg" ? "text-2xl" : "text-[10px]"
      }`}
    >
      {label.charAt(0).toUpperCase()}
    </span>
  );
}

/** SDXL-only style picker: selected styles, search, max 5 selected (SPEC.md § 3.5). */
export function StyleSelector({ selected, onChange }: StyleSelectorProps) {
  const [query, setQuery] = useState("");
  const debouncedQuery = useDebouncedValue(query, 300);
  const { data: styles = [] } = useQuery({
    queryKey: ["styles", debouncedQuery],
    queryFn: ({ signal }) => fetchStyles(debouncedQuery, signal),
  });

  const atLimit = selected.length >= MAX_STYLES;
  const trimmedQuery = debouncedQuery.trim();
  const unselectedStyles = useMemo(
    () => styles.filter((style) => !selected.includes(style.id)),
    [styles, selected],
  );
  // Without a query the picker is meant to be browsed (O9), so every unselected style
  // is shown; the Fooocus-only/limit-to-24 narrowing from pickVisibleStyles only applies
  // once the user is actively searching.
  const { visible, hiddenCount } =
    trimmedQuery === "" ? { visible: unselectedStyles, hiddenCount: 0 } : pickVisibleStyles(styles, debouncedQuery, selected);
  const styleById = useMemo(() => new Map(styles.map((style) => [style.id, style])), [styles]);

  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="flex items-center gap-1 text-sm font-semibold text-ink">
        Stili (massimo {MAX_STYLES})
        <InfoTip text={HELP_TEXTS.styles} label="Informazioni: Stili" />
      </legend>

      {selected.length > 0 ? (
        <div className="flex flex-wrap gap-2" aria-label="Stili scelti">
          {selected.map((styleId) => {
            const match = styleById.get(styleId);
            return (
              <button
                key={styleId}
                type="button"
                aria-pressed="true"
                onClick={() => onChange(selected.filter((id) => id !== styleId))}
                className={`${CHIP_CLASS} border-accent bg-paper-3 text-ink`}
              >
                <StyleThumbnail previewUrl={match?.preview_url} label={match?.name ?? styleId} size="sm" />
                {styleId} <span aria-hidden="true">×</span>
                <span className="sr-only">(togli)</span>
              </button>
            );
          })}
        </div>
      ) : (
        <p className="text-xs text-ink-muted">Nessuno stile scelto.</p>
      )}

      <label htmlFor="style-search" className="sr-only">
        Cerca uno stile
      </label>
      <input
        id="style-search"
        type="search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Cerca fra tutti gli stili (es. watercolor, anime, photo)..."
        className="min-h-11 rounded-md border border-border bg-paper-2 px-2 py-1 text-sm text-ink"
      />

      <div className="grid max-h-[28rem] grid-cols-3 gap-2 overflow-y-auto sm:grid-cols-4 lg:grid-cols-6">
        {visible.map((style) => (
          <button
            key={style.id}
            type="button"
            aria-pressed="false"
            disabled={atLimit}
            onClick={() => onChange([...selected, style.id])}
            className={CARD_CLASS}
          >
            <StyleThumbnail previewUrl={style.preview_url} label={style.name} size="lg" />
            <span className="line-clamp-2 text-xs">{style.name}</span>
          </button>
        ))}
      </div>
      {trimmedQuery === "" ? (
        <p className="text-xs text-ink-muted">{unselectedStyles.length} stili</p>
      ) : hiddenCount > 0 ? (
        <p className="text-xs text-ink-muted">Altri {hiddenCount} risultati: affina la ricerca.</p>
      ) : null}
    </fieldset>
  );
}
