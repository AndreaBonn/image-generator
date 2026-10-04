import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchStyles } from "@/api/queries";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { pickVisibleStyles } from "@/lib/styles";
import { InfoTip } from "@/components/ui/InfoTip";
import { HELP_TEXTS } from "@/lib/helpTexts";

const MAX_STYLES = 5;
const CHIP_CLASS = "min-h-11 rounded-md border px-3 py-2 text-xs font-medium";

interface StyleSelectorProps {
  selected: string[];
  onChange: (styleIds: string[]) => void;
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
  const { visible, hiddenCount } = pickVisibleStyles(styles, debouncedQuery, selected);

  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="flex items-center gap-1 text-sm font-semibold text-ink">
        Stili (massimo {MAX_STYLES})
        <InfoTip text={HELP_TEXTS.styles} label="Informazioni: Stili" />
      </legend>

      {selected.length > 0 ? (
        <div className="flex flex-wrap gap-2" aria-label="Stili scelti">
          {selected.map((styleId) => (
            <button
              key={styleId}
              type="button"
              aria-pressed="true"
              onClick={() => onChange(selected.filter((id) => id !== styleId))}
              className={`${CHIP_CLASS} border-accent bg-paper-3 text-ink`}
            >
              {styleId} <span aria-hidden="true">×</span>
              <span className="sr-only">(togli)</span>
            </button>
          ))}
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

      <div className="flex flex-wrap gap-2">
        {visible.map((style) => (
          <button
            key={style.id}
            type="button"
            aria-pressed="false"
            disabled={atLimit}
            onClick={() => onChange([...selected, style.id])}
            className={`${CHIP_CLASS} border-border bg-paper-2 text-ink-muted hover:bg-paper-3 disabled:cursor-not-allowed disabled:opacity-50`}
          >
            {style.name}
          </button>
        ))}
      </div>
      {hiddenCount > 0 ? (
        <p className="text-xs text-ink-muted">
          {debouncedQuery.trim() === ""
            ? `Altri ${hiddenCount} stili disponibili: cercali per nome.`
            : `Altri ${hiddenCount} risultati: affina la ricerca.`}
        </p>
      ) : null}
    </fieldset>
  );
}
