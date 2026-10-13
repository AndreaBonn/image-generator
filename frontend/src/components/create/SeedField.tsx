import { InfoTip } from "@/components/ui/InfoTip";
import { HELP_TEXTS } from "@/lib/helpTexts";

interface SeedFieldProps {
  seed: number | null;
  locked: boolean;
  onChange: (seed: number | null) => void;
  onToggleLocked: (locked: boolean) => void;
}

/** Seed field with "casuale" and a lock to keep the current value across runs. */
export function SeedField({ seed, locked, onChange, onToggleLocked }: SeedFieldProps) {
  const isRandom = seed === null;

  return (
    <div className="flex flex-col gap-2">
      <span className="flex items-center gap-1">
        <label htmlFor="seed-input" className="text-sm font-semibold text-ink">
          Codice del risultato
        </label>
        <InfoTip text={HELP_TEXTS.seed} label="Informazioni: Codice del risultato" />
      </span>
      <div className="flex flex-wrap items-center gap-2">
        <input
          id="seed-input"
          type="number"
          inputMode="numeric"
          disabled={isRandom}
          value={seed ?? ""}
          onChange={(event) => {
            const parsed = Number(event.target.value);
            onChange(Number.isFinite(parsed) ? parsed : null);
          }}
          className="min-h-11 w-40 rounded-md border border-border bg-paper-2 px-2 py-1 text-sm text-ink disabled:cursor-not-allowed disabled:bg-paper-3 disabled:text-ink-muted"
        />
        <label className="flex min-h-11 items-center gap-1 text-sm text-ink-muted">
          <input
            type="checkbox"
            checked={isRandom}
            onChange={(event) => onChange(event.target.checked ? null : 0)}
          />
          Casuale
        </label>
        <button
          type="button"
          aria-pressed={locked}
          onClick={() => onToggleLocked(!locked)}
          className={`min-h-11 rounded-md border px-3 py-2 text-xs font-medium ${
            locked ? "border-accent bg-paper-3 text-ink" : "border-border bg-paper-2 text-ink-muted"
          }`}
        >
          {locked ? "Codice tenuto" : "Tieni questo codice"}
        </button>
        <InfoTip text={HELP_TEXTS.seedLock} label="Informazioni: Tieni questo codice" />
      </div>
    </div>
  );
}
