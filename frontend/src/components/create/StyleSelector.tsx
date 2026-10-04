import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchStyles } from "@/api/queries";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";

const MAX_STYLES = 5;

interface StyleSelectorProps {
  selected: string[];
  onChange: (styleIds: string[]) => void;
}

/** SDXL-only style picker: search, max 5 selected (SPEC.md § 3.5). */
export function StyleSelector({ selected, onChange }: StyleSelectorProps) {
  const [query, setQuery] = useState("");
  const debouncedQuery = useDebouncedValue(query, 300);
  const { data: styles = [] } = useQuery({
    queryKey: ["styles", debouncedQuery],
    queryFn: ({ signal }) => fetchStyles(debouncedQuery, signal),
  });

  const atLimit = selected.length >= MAX_STYLES;

  function toggle(styleId: string) {
    if (selected.includes(styleId)) {
      onChange(selected.filter((id) => id !== styleId));
    } else if (!atLimit) {
      onChange([...selected, styleId]);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <label htmlFor="style-search" className="text-sm font-semibold text-ink">
        Stili (massimo {MAX_STYLES})
      </label>
      <input
        id="style-search"
        type="search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Cerca uno stile..."
        className="min-h-11 rounded-md border border-border bg-paper-2 px-2 py-1 text-sm text-ink"
      />
      <div className="flex flex-wrap gap-2">
        {styles.map((style) => {
          const isSelected = selected.includes(style.id);
          return (
            <button
              key={style.id}
              type="button"
              aria-pressed={isSelected}
              disabled={!isSelected && atLimit}
              onClick={() => toggle(style.id)}
              className={`min-h-11 rounded-md border px-3 py-2 text-xs font-medium ${
                isSelected
                  ? "border-accent bg-paper-3 text-ink"
                  : "border-border bg-paper-2 text-ink-muted hover:bg-paper-3 disabled:cursor-not-allowed disabled:opacity-50"
              }`}
            >
              {style.name}
            </button>
          );
        })}
      </div>
    </div>
  );
}
