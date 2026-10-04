import { computeOutpaintPreview, type OutpaintDirection } from "@/lib/outpaint";
import { InfoTip } from "@/components/ui/InfoTip";
import { HELP_TEXTS } from "@/lib/helpTexts";

const DIRECTION_LABELS: Record<OutpaintDirection, string> = {
  top: "Sopra",
  bottom: "Sotto",
  left: "Sinistra",
  right: "Destra",
};

const PREVIEW_MAX_PX = 220;

interface OutpaintPanelProps {
  imageUrl: string;
  width: number;
  height: number;
  directions: OutpaintDirection[];
  onToggle: (direction: OutpaintDirection) => void;
}

/** 4 direction toggles + a preview of the expanded canvas (SPEC.md § 11.2, § 3.2: 30% per side). */
export function OutpaintPanel({ imageUrl, width, height, directions, onToggle }: OutpaintPanelProps) {
  const preview = computeOutpaintPreview(width, height, directions);
  const scale = PREVIEW_MAX_PX / Math.max(preview.canvasWidth, preview.canvasHeight);

  return (
    <div className="flex flex-col gap-3">
      <fieldset className="flex flex-col gap-2">
        <legend className="flex items-center gap-1 text-sm font-semibold text-ink">
          Direzioni
          <InfoTip text={HELP_TEXTS.outpaintDirections} label="Informazioni: Direzioni" />
        </legend>
        <div className="flex flex-wrap gap-2">
          {(Object.keys(DIRECTION_LABELS) as OutpaintDirection[]).map((direction) => {
            const selected = directions.includes(direction);
            return (
              <button
                key={direction}
                type="button"
                aria-pressed={selected}
                onClick={() => onToggle(direction)}
                className={`min-h-11 rounded-md border px-3 py-2 text-sm font-medium ${
                  selected
                    ? "border-accent bg-paper-3 text-ink"
                    : "border-border bg-paper-2 text-ink-muted hover:bg-paper-3"
                }`}
              >
                {DIRECTION_LABELS[direction]}
              </button>
            );
          })}
        </div>
      </fieldset>

      <div
        className="relative rounded-md border border-dashed border-border bg-paper-3"
        style={{ width: preview.canvasWidth * scale, height: preview.canvasHeight * scale }}
        aria-hidden="true"
      >
        <img
          src={imageUrl}
          alt=""
          className="absolute object-fill"
          style={{
            left: preview.imageRect.x * scale,
            top: preview.imageRect.y * scale,
            width: preview.imageRect.width * scale,
            height: preview.imageRect.height * scale,
          }}
        />
      </div>
      <p className="text-xs text-ink-muted">
        Anteprima del nuovo riquadro: l&apos;area tratteggiata è la zona nuova da generare.
      </p>
    </div>
  );
}
