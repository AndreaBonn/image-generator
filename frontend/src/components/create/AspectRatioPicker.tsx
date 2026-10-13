import { useState } from "react";
import type { AspectRatio } from "@/api/types";
import { FIELD_HINTS } from "@/lib/helpTexts";
import { ratioName, ratioUse } from "@/lib/aspectRatioDisplay";

const SHAPE_MAX_PX = 16;

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
    <fieldset className="flex flex-col gap-2" aria-describedby="aspect-ratio-hint">
      <legend className="text-sm font-semibold text-ink">Proporzioni</legend>
      <p id="aspect-ratio-hint" className="-mt-1 text-xs text-ink-muted">
        {FIELD_HINTS.aspectRatio}
      </p>
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
  const name = ratioName(ratio.label);
  const use = ratioUse(ratio.width, ratio.height);
  return (
    <button
      type="button"
      aria-pressed={selected}
      aria-label={use ? `${name}, ${use}` : name}
      title={`${ratio.width}×${ratio.height} pixel`}
      onClick={() => onChange(ratio.value)}
      className={`flex min-h-11 items-center gap-2 rounded-md border px-3 py-2 text-xs font-medium ${
        selected ? "border-accent bg-paper-3 text-ink" : "border-border bg-paper-2 text-ink-muted hover:bg-paper-3"
      }`}
    >
      <RatioShape width={ratio.width} height={ratio.height} />
      <span>
        {name}
        {use ? <span className="font-normal text-ink-muted">, {use}</span> : null}
      </span>
    </button>
  );
}

/** Small outline of the format, scaled so its longer side is SHAPE_MAX_PX. */
function RatioShape({ width, height }: { width: number; height: number }) {
  const scale = SHAPE_MAX_PX / Math.max(width, height);
  return (
    <span
      data-shape
      aria-hidden="true"
      className="shrink-0 rounded-[2px] border-[1.5px] border-current"
      style={{ width: Math.round(width * scale), height: Math.round(height * scale) }}
    />
  );
}
