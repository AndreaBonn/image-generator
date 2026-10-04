type UpscaleFactor = 2 | 4;

interface FactorButtonProps {
  factor: UpscaleFactor;
  selected: boolean;
  onSelect: (factor: UpscaleFactor) => void;
}

/** One ×2/×4 radio option for the plain upscale action (SPEC.md § 11.2). */
export function FactorButton({ factor, selected, onSelect }: FactorButtonProps) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={() => onSelect(factor)}
      className={`min-h-11 rounded-md border px-3 py-2 text-sm font-medium ${
        selected ? "border-accent bg-paper-3 text-ink" : "border-border bg-paper-2 text-ink-muted hover:bg-paper-3"
      }`}
    >
      ×{factor}
    </button>
  );
}
