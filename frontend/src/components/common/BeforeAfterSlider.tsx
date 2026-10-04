import { useState } from "react";
import { clipPathForPercent } from "@/lib/beforeAfter";

const INITIAL_PERCENT = 50;

interface BeforeAfterSliderProps {
  beforeUrl: string;
  afterUrl: string;
  sliderId: string;
}

/**
 * Prima/dopo comparison for a Migliora result (SPEC.md § 11.2): the "after"
 * image overlays the original, clipped by a keyboard-controllable range
 * input. Stacks naturally on narrow screens since it is a single column
 * (the page's own grid handles the mobile layout, SPEC.md § 11.1).
 */
export function BeforeAfterSlider({ beforeUrl, afterUrl, sliderId }: BeforeAfterSliderProps) {
  const [percent, setPercent] = useState(INITIAL_PERCENT);

  return (
    <div className="flex flex-col gap-2">
      <div className="relative aspect-square w-full overflow-hidden rounded-md border border-border bg-paper-2 sm:aspect-video">
        <img src={beforeUrl} alt="Originale, prima" className="absolute inset-0 h-full w-full object-cover" />
        <img
          src={afterUrl}
          alt="Risultato, dopo"
          style={{ clipPath: clipPathForPercent(percent) }}
          className="absolute inset-0 h-full w-full object-cover"
        />
      </div>
      <label htmlFor={sliderId} className="text-sm text-ink-muted">
        Confronto prima/dopo
      </label>
      <input
        id={sliderId}
        type="range"
        min={0}
        max={100}
        value={percent}
        onChange={(event) => setPercent(Number(event.target.value))}
        aria-valuetext={`${percent}% di dopo visibile`}
        className="min-h-11 w-full"
      />
    </div>
  );
}
