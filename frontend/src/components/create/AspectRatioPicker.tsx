import { useState } from "react";
import type { AspectRatio } from "@/api/types";

interface AspectRatioPickerProps {
  ratios: AspectRatio[];
  value: string;
  onChange: (value: string) => void;
}

/** 6 featured ratios up front, the rest under "Altri formati" (SPEC.md § 3.4). */
export function AspectRatioPicker({ ratios, value, onChange }: AspectRatioPickerProps) {
  const [showAll, setShowAll] = useState(false);
  const featured = ratios.filter((r) => r.featured);
  const others = ratios.filter((r) => !r.featured);

  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="text-sm font-semibold text-ink">Proporzioni</legend>
      <div className="flex flex-wrap gap-2">
        {featured.map((ratio) => (
          <RatioButton key={ratio.value} ratio={ratio} selected={ratio.value === value} onChange={onChange} />
        ))}
      </div>
      {others.length > 0 ? (
        <div>
          <button
            type="button"
            onClick={() => setShowAll((open) => !open)}
            aria-expanded={showAll}
            className="min-h-11 text-sm text-accent-text underline"
          >
            {showAll ? "Nascondi altri formati" : "Altri formati"}
          </button>
          {showAll ? (
            <div className="mt-2 flex flex-wrap gap-2">
              {others.map((ratio) => (
                <RatioButton key={ratio.value} ratio={ratio} selected={ratio.value === value} onChange={onChange} />
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </fieldset>
  );
}

function RatioButton({
  ratio,
  selected,
  onChange,
}: {
  ratio: AspectRatio;
  selected: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={() => onChange(ratio.value)}
      className={`min-h-11 rounded-md border px-3 py-2 text-xs font-medium ${
        selected ? "border-accent bg-paper-3 text-ink" : "border-border bg-paper-2 text-ink-muted hover:bg-paper-3"
      }`}
    >
      {ratio.label}
    </button>
  );
}
