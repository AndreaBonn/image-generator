import { useState } from "react";
import type { Task } from "@/api/types";
import { InfoTip } from "@/components/ui/InfoTip";
import { HELP_TEXTS } from "@/lib/helpTexts";

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
          <div className="flex flex-col gap-1 text-sm text-ink">
            <span className="flex items-center gap-1">
              <label htmlFor="advanced-steps-input">Passi di generazione</label>
              <InfoTip text={HELP_TEXTS.steps} label="Informazioni: Passi di generazione" />
            </span>
            <input
              id="advanced-steps-input"
              type="number"
              min={task.limits.steps.min}
              max={task.limits.steps.max}
              value={steps ?? task.defaults.steps}
              onChange={(event) => onStepsChange(Number(event.target.value))}
              className="min-h-11 w-32 rounded-md border border-border bg-paper px-2 py-1"
            />
            <span className="text-xs text-ink-muted">Consigliato: {task.defaults.steps}</span>
          </div>
          <div className="flex flex-col gap-1 text-sm text-ink">
            <span className="flex items-center gap-1">
              <label htmlFor="advanced-cfg-input">Aderenza al prompt</label>
              <InfoTip text={HELP_TEXTS.cfg} label="Informazioni: Aderenza al prompt" />
            </span>
            <input
              id="advanced-cfg-input"
              type="number"
              step="0.1"
              min={task.limits.cfg.min}
              max={task.limits.cfg.max}
              value={cfg ?? task.defaults.cfg}
              onChange={(event) => onCfgChange(Number(event.target.value))}
              className="min-h-11 w-32 rounded-md border border-border bg-paper px-2 py-1"
            />
            <span className="text-xs text-ink-muted">Consigliato: {task.defaults.cfg}</span>
          </div>
          {task.supports_negative ? (
            <div className="flex flex-col gap-1 text-sm text-ink">
              <span className="flex items-center gap-1">
                <label htmlFor="advanced-negative-prompt">Prompt negativo</label>
                <InfoTip text={HELP_TEXTS.negativePrompt} label="Informazioni: Prompt negativo" />
              </span>
              <textarea
                id="advanced-negative-prompt"
                value={negativePrompt}
                onChange={(event) => onNegativePromptChange(event.target.value)}
                rows={2}
                className="rounded-md border border-border bg-paper px-2 py-1"
              />
              <span className="text-xs text-ink-muted">Separa più elementi con una virgola.</span>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
