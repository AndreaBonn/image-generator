import { ActionButton } from "@/components/improve/ActionButton";
import { PromptGuide } from "@/components/create/PromptGuide";
import { InfoTip } from "@/components/ui/InfoTip";
import { HELP_TEXTS } from "@/lib/helpTexts";
import type { Task } from "@/api/types";
import { refinementLevel } from "@/lib/refinementLevel";

const MAX_PROMPT_LENGTH = 2000;
const DEFAULT_DENOISE = 0.3;

interface RefinedUpscaleActionProps {
  task: Task | undefined;
  prompt: string;
  promptError: string | null;
  onPromptChange: (value: string) => void;
  denoise: number | null;
  onDenoiseChange: (value: number) => void;
  disabledReason: string | null;
  isGenerating: boolean;
  isActive: boolean;
  onClick: () => void;
}

/**
 * "Ingrandisci con rifinitura" (F2, group migliora): fixed ×2, optional
 * English prompt, and a denoise slider when the task's catalog entry
 * exposes one (config/tasks.yaml `ingrandisci_rifinito.limits.denoise`).
 * Slower than the plain upscale, so the estimate is shown before the user
 * starts it, not only inside the InfoTip.
 */
export function RefinedUpscaleAction({
  task,
  prompt,
  promptError,
  onPromptChange,
  denoise,
  onDenoiseChange,
  disabledReason,
  isGenerating,
  isActive,
  onClick,
}: RefinedUpscaleActionProps) {
  const denoiseLimit = task?.limits.denoise;
  const denoiseValue = denoise ?? task?.defaults.denoise ?? DEFAULT_DENOISE;

  return (
    <fieldset className="flex min-w-0 flex-col gap-2">
      <legend className="flex items-center gap-1 text-sm font-semibold text-ink">
        Ingrandisci con rifinitura
        <InfoTip text={HELP_TEXTS.ingrandisciRifinito} label="Informazioni: Ingrandisci con rifinitura" />
      </legend>

      {task ? (
        <>
          <PromptGuide
            promptLanguage={task.prompt_language}
            tips={task.prompt_tips}
            examples={task.prompt_examples}
            prompt={prompt}
            onUseExample={onPromptChange}
          />
          <div className="flex flex-col gap-1">
            <label htmlFor="refined-upscale-prompt-input" className="text-sm text-ink">
              Descrizione per la rifinitura (facoltativa)
            </label>
            <textarea
              id="refined-upscale-prompt-input"
              value={prompt}
              onChange={(event) => onPromptChange(event.target.value)}
              rows={2}
              maxLength={MAX_PROMPT_LENGTH}
              className="rounded-md border border-border bg-paper-2 px-2 py-1 text-sm text-ink"
              aria-invalid={promptError !== null}
              aria-describedby={promptError ? "refined-upscale-prompt-error" : undefined}
            />
            {promptError ? (
              <p id="refined-upscale-prompt-error" role="alert" className="text-sm text-danger">
                {promptError}
              </p>
            ) : null}
          </div>
        </>
      ) : null}

      {denoiseLimit ? (
        <div className="flex flex-col gap-1 text-sm text-ink">
          <p>
            <label htmlFor="refined-upscale-denoise-input">Quanto può cambiare i dettagli</label>:{" "}
            <strong aria-hidden="true">{refinementLevel(denoiseValue)}</strong>
          </p>
          <div className="flex max-w-sm items-center gap-2 text-xs text-ink-muted">
            <span>Fedele all&apos;originale</span>
            <input
              id="refined-upscale-denoise-input"
              type="range"
              min={denoiseLimit.min}
              max={denoiseLimit.max}
              step={0.05}
              value={denoiseValue}
              aria-valuetext={refinementLevel(denoiseValue)}
              onChange={(event) => onDenoiseChange(Number(event.target.value))}
              className="min-h-11 min-w-0 flex-1"
            />
            <span>Più inventiva</span>
          </div>
        </div>
      ) : null}

      <p className="text-xs text-ink-muted">Tempo stimato: circa 1-2 minuti.</p>

      <ActionButton
        label="Ingrandisci con rifinitura"
        disabledReason={disabledReason}
        isGenerating={isGenerating}
        isActive={isActive}
        onClick={onClick}
      />
    </fieldset>
  );
}
