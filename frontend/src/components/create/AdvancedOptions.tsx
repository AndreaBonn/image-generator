import { useState } from "react";
import type { Task } from "@/api/types";

interface AdvancedOptionsProps {
  task: Task;
  steps: number | null;
  cfg: number | null;
  negativePrompt: string;
  onStepsChange: (steps: number | null) => void;
  onCfgChange: (cfg: number | null) => void;
  onNegativePromptChange: (value: string) => void;
}

/** Closed by default (SPEC.md § 11.2): steps, CFG with a plain-language tooltip, negative prompt. */
export function AdvancedOptions({
  task,
  steps,
  cfg,
  negativePrompt,
  onStepsChange,
  onCfgChange,
  onNegativePromptChange,
}: AdvancedOptionsProps) {
  const [open, setOpen] = useState(false);

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="min-h-11 text-left text-sm font-semibold text-ink"
      >
        {open ? "▾" : "▸"} Opzioni avanzate
      </button>
      {open ? (
        <div className="flex flex-col gap-3 rounded-md border border-border bg-paper-2 p-3">
          <label className="flex flex-col gap-1 text-sm text-ink">
            Passi di generazione
            <input
              type="number"
              min={task.limits.steps.min}
              max={task.limits.steps.max}
              value={steps ?? task.defaults.steps}
              onChange={(event) => onStepsChange(Number(event.target.value))}
              className="min-h-11 w-32 rounded-md border border-border bg-paper px-2 py-1"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm text-ink">
            <span className="flex items-center gap-1">
              Aderenza al prompt
              <span
                title="Quanto l'immagine segue esattamente il testo scritto. Valori alti seguono di più, ma possono saturare i colori."
                aria-label="Quanto l'immagine segue esattamente il testo scritto. Valori alti seguono di più, ma possono saturare i colori."
                className="cursor-help text-ink-muted"
              >
                (?)
              </span>
            </span>
            <input
              type="number"
              step="0.1"
              min={task.limits.cfg.min}
              max={task.limits.cfg.max}
              value={cfg ?? task.defaults.cfg}
              onChange={(event) => onCfgChange(Number(event.target.value))}
              className="min-h-11 w-32 rounded-md border border-border bg-paper px-2 py-1"
            />
          </label>
          {task.supports_negative ? (
            <label className="flex flex-col gap-1 text-sm text-ink">
              Prompt negativo
              <textarea
                value={negativePrompt}
                onChange={(event) => onNegativePromptChange(event.target.value)}
                rows={2}
                className="rounded-md border border-border bg-paper px-2 py-1"
              />
            </label>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
