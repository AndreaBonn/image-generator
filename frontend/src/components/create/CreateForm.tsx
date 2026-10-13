import type { RefObject } from "react";
import { PromptGuide } from "@/components/create/PromptGuide";
import { PromptExamples } from "@/components/create/PromptExamples";
import { AspectRatioPicker } from "@/components/create/AspectRatioPicker";
import { SeedField } from "@/components/create/SeedField";
import { StyleSelector } from "@/components/create/StyleSelector";
import { AdvancedOptions } from "@/components/create/AdvancedOptions";
import { RecipeImport } from "@/components/create/RecipeImport";
import { ReferencesSection } from "@/components/create/ReferencesSection";
import type { ReferenceItem } from "@/components/create/ReferencePicker";
import { GpuWarning } from "@/components/layout/GpuWarning";
import { FIELD_HINTS } from "@/lib/helpTexts";
import { MAX_PROMPT_LENGTH, MIN_BATCH, MAX_BATCH } from "@/lib/createFormLimits";
import type { RecipeImportPatch } from "@/lib/recipeImport";
import type { Task } from "@/api/types";

const BATCH_OPTIONS = Array.from({ length: MAX_BATCH - MIN_BATCH + 1 }, (_, index) => MIN_BATCH + index);

interface CreateFormProps {
  selectedTask: Task;
  creationTasks: Task[];
  prompt: string;
  onPromptChange: (prompt: string) => void;
  promptError: string | null;
  negativePrompt: string;
  onNegativePromptChange: (value: string) => void;
  aspectRatio: string;
  onAspectRatioChange: (value: string) => void;
  batch: number;
  onBatchChange: (value: number) => void;
  styleIds: string[];
  onStyleIdsChange: (ids: string[]) => void;
  seed: number | null;
  seedLocked: boolean;
  onSeedChange: (seed: number | null) => void;
  onSeedLockedChange: (locked: boolean) => void;
  steps: number | null;
  cfg: number | null;
  onStepsChange: (steps: number | null) => void;
  onCfgChange: (cfg: number | null) => void;
  onApplyRecipe: (patch: RecipeImportPatch) => void;
  references: ReferenceItem[];
  onReferencesChange: (items: ReferenceItem[]) => void;
  referencesNotice: string | null;
  requiresReferences: boolean;
  minReferences: number;
  missingReferences: boolean;
  canSketch: boolean;
  sketchInProgress: boolean;
  onSketchDirtyChange: (dirty: boolean) => void;
  onSubmit: () => void;
  submitDisabled: boolean;
  submitLabel: string;
  generateButtonRef: RefObject<HTMLButtonElement | null>;
}

/** The whole creation form (prompt, references, params, submit) shown once a
 * task is selected on CreatePage. Pure presentation: all state lives in the
 * parent, via useReferences and CreatePage's own hooks. */
export function CreateForm({
  selectedTask,
  creationTasks,
  prompt,
  onPromptChange,
  promptError,
  negativePrompt,
  onNegativePromptChange,
  aspectRatio,
  onAspectRatioChange,
  batch,
  onBatchChange,
  styleIds,
  onStyleIdsChange,
  seed,
  seedLocked,
  onSeedChange,
  onSeedLockedChange,
  steps,
  cfg,
  onStepsChange,
  onCfgChange,
  onApplyRecipe,
  references,
  onReferencesChange,
  referencesNotice,
  requiresReferences,
  minReferences,
  missingReferences,
  canSketch,
  sketchInProgress,
  onSketchDirtyChange,
  onSubmit,
  submitDisabled,
  submitLabel,
  generateButtonRef,
}: CreateFormProps) {
  return (
    <>
      <PromptGuide
        promptLanguage={selectedTask.prompt_language}
        tips={selectedTask.prompt_tips}
        examples={[]}
        prompt={prompt}
        onUseExample={onPromptChange}
      />

      {requiresReferences ? (
        <ReferencesSection
          references={references}
          onReferencesChange={onReferencesChange}
          minReferences={minReferences}
          maxReferences={selectedTask.max_references}
          labels={selectedTask.reference_labels}
          canSketch={canSketch}
          sketchInProgress={sketchInProgress}
          referencesNotice={referencesNotice}
          onSketchDirtyChange={onSketchDirtyChange}
        />
      ) : null}

      <RecipeImport tasks={creationTasks} onApply={onApplyRecipe}>
        <div className="flex flex-col gap-1">
          <label htmlFor="prompt-input" className="text-sm font-semibold text-ink">
            Descrivi l'immagine che vuoi
          </label>
          <textarea
            id="prompt-input"
            value={prompt}
            onChange={(event) => onPromptChange(event.target.value)}
            rows={5}
            maxLength={MAX_PROMPT_LENGTH}
            className="rounded-md border border-border bg-paper-2 px-3 py-2 text-base text-ink"
            aria-invalid={promptError !== null}
            aria-describedby={promptError ? "prompt-error" : undefined}
          />
          {promptError ? (
            <p id="prompt-error" role="alert" className="text-sm text-danger">
              {promptError}
            </p>
          ) : null}
          <PromptExamples examples={selectedTask.prompt_examples} onUseExample={onPromptChange} />
        </div>
      </RecipeImport>

      <AspectRatioPicker ratios={selectedTask.aspect_ratios} value={aspectRatio} onChange={onAspectRatioChange} />

      <fieldset className="flex flex-col gap-1 text-sm text-ink" aria-describedby="batch-hint">
        <legend className="font-semibold">Numero di immagini</legend>
        <p id="batch-hint" className="text-xs text-ink-muted">
          {FIELD_HINTS.batch}
        </p>
        <div className="flex w-fit overflow-hidden rounded-md border border-border">
          {BATCH_OPTIONS.map((count) => (
            <button
              key={count}
              type="button"
              aria-pressed={batch === count}
              onClick={() => onBatchChange(count)}
              className={`min-h-11 min-w-11 border-r border-border px-3 last:border-r-0 ${
                batch === count ? "bg-paper-3 font-semibold text-ink" : "bg-paper-2 text-ink-muted hover:bg-paper-3"
              }`}
            >
              {count}
            </button>
          ))}
        </div>
      </fieldset>

      {selectedTask.supports_styles ? <StyleSelector selected={styleIds} onChange={onStyleIdsChange} /> : null}

      <SeedField seed={seed} locked={seedLocked} onChange={onSeedChange} onToggleLocked={onSeedLockedChange} />

      <AdvancedOptions
        task={selectedTask}
        steps={steps}
        cfg={cfg}
        negativePrompt={negativePrompt}
        onStepsChange={onStepsChange}
        onCfgChange={onCfgChange}
        onNegativePromptChange={onNegativePromptChange}
      />

      <GpuWarning />

      <div className="flex flex-col gap-1">
        <button
          ref={generateButtonRef}
          type="button"
          onClick={onSubmit}
          disabled={submitDisabled}
          aria-describedby={missingReferences ? "references-missing-reason" : undefined}
          className="min-h-11 w-fit rounded-md bg-accent px-4 py-2 text-sm font-semibold text-accent-ink disabled:cursor-not-allowed disabled:bg-paper-3 disabled:text-ink-muted"
        >
          {submitLabel}
        </button>
        {missingReferences ? (
          <p id="references-missing-reason" className="text-sm text-ink-muted">
            {minReferences > 1
              ? `Aggiungi almeno ${minReferences} immagini di riferimento per generare.`
              : "Aggiungi almeno un'immagine di riferimento per generare."}
          </p>
        ) : null}
      </div>
    </>
  );
}
