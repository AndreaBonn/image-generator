import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchTasks, fetchExamples, createJob, cancelJob } from "@/api/queries";
import { useJobEvents } from "@/api/useJobEvents";
import { ApiError } from "@/api/errors";
import { TaskSelector } from "@/components/create/TaskSelector";
import { PromptGuide } from "@/components/create/PromptGuide";
import { AspectRatioPicker } from "@/components/create/AspectRatioPicker";
import { SeedField } from "@/components/create/SeedField";
import { StyleSelector } from "@/components/create/StyleSelector";
import { AdvancedOptions } from "@/components/create/AdvancedOptions";
import { ResultArea } from "@/components/create/ResultArea";
import { RecipeImport } from "@/components/create/RecipeImport";
import { ReferencePicker, type ReferenceItem } from "@/components/create/ReferencePicker";
import { SketchPad } from "@/components/create/SketchPad";
import { ExamplesPanel, type TryExamplePatch } from "@/components/create/ExamplesPanel";
import { GpuWarning } from "@/components/layout/GpuWarning";
import { InfoTip } from "@/components/ui/InfoTip";
import { HELP_TEXTS } from "@/lib/helpTexts";
import type { RecipeImportPatch } from "@/lib/recipeImport";
import type { Task } from "@/api/types";

const MAX_PROMPT_LENGTH = 2000;
const MIN_BATCH = 1;
const MAX_BATCH = 4;
/** Only task whose first reference slot can be drawn instead of picked (SPEC.md
 * § 3.2): /tasks has no "can sketch" flag, so the id is matched directly. */
const SKETCH_TASK_ID = "da_schizzo";

export function CreatePage() {
  const tasksQuery = useQuery({ queryKey: ["tasks"], queryFn: ({ signal }) => fetchTasks(signal) });
  const creationTasks = useMemo(
    () => (tasksQuery.data ?? []).filter((t) => t.group === "crea"),
    [tasksQuery.data],
  );
  // First-use "prova questo" (SPEC.md § 11.3): hidden the moment the user has
  // generated anything, so a failed fetch just means no panel, not a page error.
  const examplesQuery = useQuery({ queryKey: ["examples"], queryFn: ({ signal }) => fetchExamples(signal) });
  const showExamples = examplesQuery.data?.first_use === true;
  const generateButtonRef = useRef<HTMLButtonElement | null>(null);

  const [taskId, setTaskId] = useState<string | null>(null);
  const [prompt, setPrompt] = useState("");
  const [negativePrompt, setNegativePrompt] = useState("");
  const [aspectRatio, setAspectRatio] = useState("");
  const [batch, setBatch] = useState(1);
  const [styleIds, setStyleIds] = useState<string[]>([]);
  const [seed, setSeed] = useState<number | null>(null);
  const [seedLocked, setSeedLocked] = useState(false);
  const [steps, setSteps] = useState<number | null>(null);
  const [cfg, setCfg] = useState<number | null>(null);
  const [promptError, setPromptError] = useState<string | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [generationIds, setGenerationIds] = useState<string[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [references, setReferences] = useState<ReferenceItem[]>([]);
  const [referencesNotice, setReferencesNotice] = useState<string | null>(null);
  const [sketchDirty, setSketchDirty] = useState(false);

  const selectedTask: Task | undefined = creationTasks.find((t) => t.id === taskId);
  const requiresReferences = (selectedTask?.max_references ?? 0) > 0;
  const minReferences = selectedTask?.min_references ?? 1;
  const missingReferences = requiresReferences && references.length < minReferences;
  const canSketch = selectedTask?.id === SKETCH_TASK_ID && references.length === 0;
  // Adding a reference would unmount the pad and drop a drawing not yet used as the sketch.
  const sketchInProgress = canSketch && sketchDirty;

  useEffect(() => {
    if (!taskId && creationTasks.length > 0) {
      const firstAvailable = creationTasks.find((t) => t.available);
      if (firstAvailable) {
        setTaskId(firstAvailable.id);
        setAspectRatio(firstAvailable.default_aspect_ratio);
        setStyleIds(firstAvailable.default_styles);
      }
    }
  }, [creationTasks, taskId]);

  const { latest, latestPreviewUrl, isDone } = useJobEvents(jobId);
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!latest) return;
    if (latest.type === "completed") {
      setGenerationIds(latest.generation_ids);
      setJobId(null);
      // The first generation ends "first use": refetch so the examples panel goes away now.
      void queryClient.invalidateQueries({ queryKey: ["examples"] });
    } else if (latest.type === "failed") {
      setErrorMessage(latest.message);
      setJobId(null);
    } else if (latest.type === "cancelled") {
      setJobId(null);
    }
  }, [latest, queryClient]);

  const jobMutation = useMutation({
    mutationFn: createJob,
    onSuccess: (response) => {
      setErrorMessage(null);
      setJobId(response.job_id);
    },
    onError: (error: unknown) => {
      setErrorMessage(error instanceof ApiError ? error.message : "Si è verificato un errore imprevisto.");
    },
  });

  const cancelMutation = useMutation({
    mutationFn: cancelJob,
    onSettled: () => setJobId(null),
  });

  function handleApplyRecipe(patch: RecipeImportPatch) {
    if (patch.taskId) setTaskId(patch.taskId);
    setPrompt(patch.prompt);
    if (patch.negativePrompt !== undefined) setNegativePrompt(patch.negativePrompt);
    if (patch.aspectRatio) setAspectRatio(patch.aspectRatio);
    setSeed(patch.seed);
    setSeedLocked(true);
    if (patch.styleIds) setStyleIds(patch.styleIds);
    if (patch.steps !== undefined) setSteps(patch.steps);
    if (patch.cfg !== undefined) setCfg(patch.cfg);
    // A recipe never carries references (UploadRecipeParams has no such field),
    // so a task that takes them can't restore them and the user picks again.
    const patchedTask = creationTasks.find((t) => t.id === patch.taskId);
    if (patchedTask && patchedTask.max_references > 0) {
      setReferences([]);
      setReferencesNotice("Scegli di nuovo le immagini di riferimento.");
    } else {
      setReferencesNotice(null);
    }
  }

  /** "Prova questo" (SPEC.md § 11.3): fills compito, prompt, seed and format, never
   * sends a job, then moves focus to Genera so the user only has to press it. */
  function handleTryExample(patch: TryExamplePatch) {
    const task = creationTasks.find((t) => t.id === patch.taskId);
    setTaskId(patch.taskId);
    setAspectRatio(patch.aspectRatio ?? task?.default_aspect_ratio ?? "");
    setStyleIds(task?.default_styles ?? []);
    setPrompt(patch.prompt);
    if (patch.seed !== undefined) {
      setSeed(patch.seed);
      setSeedLocked(true);
    }
    setReferences([]);
    setReferencesNotice(null);
    generateButtonRef.current?.focus();
  }

  function handleSelectTask(id: string) {
    setTaskId(id);
    const task = creationTasks.find((t) => t.id === id);
    if (task) {
      setAspectRatio(task.default_aspect_ratio);
      setStyleIds(task.default_styles);
    }
    setReferences([]);
    setReferencesNotice(null);
  }

  function validate(): boolean {
    if (prompt.trim().length === 0) {
      setPromptError("Scrivi una descrizione prima di generare.");
      return false;
    }
    if (prompt.length > MAX_PROMPT_LENGTH) {
      setPromptError(`Il prompt supera i ${MAX_PROMPT_LENGTH} caratteri.`);
      return false;
    }
    setPromptError(null);
    return true;
  }

  function handleSubmit() {
    if (!selectedTask) return;
    if (!validate()) return;
    if (missingReferences) return;
    jobMutation.mutate({
      task_id: selectedTask.id,
      prompt,
      negative_prompt: negativePrompt,
      params: {
        aspect_ratio: aspectRatio,
        seed,
        batch,
        style_ids: styleIds,
        steps,
        cfg,
      },
      ...(requiresReferences ? { references: references.map((item) => item.input) } : {}),
    });
  }

  if (tasksQuery.isLoading) {
    return <p className="text-ink-muted">Caricamento compiti...</p>;
  }
  if (tasksQuery.isError) {
    return (
      <div className="flex flex-col gap-2">
        <p className="text-danger">Impossibile caricare i compiti.</p>
        <button
          type="button"
          onClick={() => tasksQuery.refetch()}
          className="min-h-11 w-fit rounded-md border border-border px-3 py-2 text-sm text-ink"
        >
          Riprova
        </button>
      </div>
    );
  }
  if (creationTasks.length === 0) {
    return <p className="text-ink-muted">Nessun compito di creazione disponibile.</p>;
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div className="flex flex-col gap-4">
        <TaskSelector tasks={creationTasks} selectedTaskId={taskId} onSelect={handleSelectTask} />

        {selectedTask ? (
          <>
            <PromptGuide
              promptLanguage={selectedTask.prompt_language}
              tips={selectedTask.prompt_tips}
              examples={selectedTask.prompt_examples}
              prompt={prompt}
              onUseExample={setPrompt}
            />

            {requiresReferences ? (
              <div className="flex flex-col gap-1">
                <ReferencePicker
                  items={references}
                  onChange={setReferences}
                  minReferences={minReferences}
                  maxReferences={selectedTask?.max_references ?? minReferences}
                  labels={selectedTask?.reference_labels}
                  disabled={sketchInProgress}
                />
                {canSketch ? (
                  <div className="flex flex-col gap-1">
                    <span className="text-sm font-semibold text-ink">Disegna lo schizzo</span>
                    <SketchPad
                      onReferenceCreated={(item) => setReferences([...references, item])}
                      onDirtyChange={setSketchDirty}
                    />
                  </div>
                ) : null}
                {sketchInProgress ? (
                  <p className="text-sm text-ink-muted">
                    Usa lo schizzo o cancellalo prima di aggiungere altre immagini.
                  </p>
                ) : null}
                {referencesNotice ? (
                  <p role="status" className="text-sm text-ink-muted">
                    {referencesNotice}
                  </p>
                ) : null}
              </div>
            ) : null}

            <RecipeImport tasks={creationTasks} onApply={handleApplyRecipe}>
              <div className="flex flex-col gap-1">
                <label htmlFor="prompt-input" className="text-sm font-semibold text-ink">
                  Descrizione
                </label>
                <textarea
                  id="prompt-input"
                  value={prompt}
                  onChange={(event) => setPrompt(event.target.value)}
                  rows={3}
                  maxLength={MAX_PROMPT_LENGTH}
                  className="rounded-md border border-border bg-paper-2 px-2 py-1 text-sm text-ink"
                  aria-invalid={promptError !== null}
                  aria-describedby={promptError ? "prompt-error" : undefined}
                />
                {promptError ? (
                  <p id="prompt-error" role="alert" className="text-sm text-danger">
                    {promptError}
                  </p>
                ) : null}
              </div>
            </RecipeImport>

            <AspectRatioPicker ratios={selectedTask.aspect_ratios} value={aspectRatio} onChange={setAspectRatio} />

            <div className="flex flex-col gap-1 text-sm text-ink">
              <span className="flex items-center gap-1">
                <label htmlFor="batch-input">Numero di immagini</label>
                <InfoTip text={HELP_TEXTS.batch} label="Informazioni: Numero di immagini" />
              </span>
              <input
                id="batch-input"
                type="number"
                min={MIN_BATCH}
                max={MAX_BATCH}
                value={batch}
                onChange={(event) =>
                  setBatch(Math.min(MAX_BATCH, Math.max(MIN_BATCH, Number(event.target.value))))
                }
                className="min-h-11 w-24 rounded-md border border-border bg-paper-2 px-2 py-1"
              />
            </div>

            {selectedTask.supports_styles ? (
              <StyleSelector selected={styleIds} onChange={setStyleIds} />
            ) : null}

            <SeedField seed={seed} locked={seedLocked} onChange={setSeed} onToggleLocked={setSeedLocked} />

            <AdvancedOptions
              task={selectedTask}
              steps={steps}
              cfg={cfg}
              negativePrompt={negativePrompt}
              onStepsChange={setSteps}
              onCfgChange={setCfg}
              onNegativePromptChange={setNegativePrompt}
            />

            <GpuWarning />

            <div className="flex flex-col gap-1">
              <button
                ref={generateButtonRef}
                type="button"
                onClick={handleSubmit}
                disabled={jobMutation.isPending || jobId !== null || missingReferences}
                aria-describedby={missingReferences ? "references-missing-reason" : undefined}
                className="min-h-11 w-fit rounded-md bg-accent px-4 py-2 text-sm font-semibold text-accent-ink disabled:cursor-not-allowed disabled:bg-paper-3 disabled:text-ink-muted"
              >
                {jobMutation.isPending || (jobId !== null && !isDone) ? "Generazione in corso..." : "Genera"}
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
        ) : null}
      </div>

      {/* order-first puts the examples (and the result area under them) above the
          form on mobile; lg:order-none restores the normal two-column layout. */}
      <div className={showExamples ? "order-first flex flex-col gap-4 lg:order-none" : "flex flex-col gap-4"}>
        {showExamples ? (
          <ExamplesPanel
            examples={examplesQuery.data?.examples ?? []}
            tasks={creationTasks}
            onTryExample={handleTryExample}
          />
        ) : null}
        <ResultArea
          latestEvent={latest}
          previewUrl={latestPreviewUrl}
          generationIds={generationIds}
          errorMessage={errorMessage}
          isRunning={jobId !== null}
          onRetry={handleSubmit}
          onCancel={() => jobId && cancelMutation.mutate(jobId)}
          hasExternalResults={showExamples}
        />
      </div>
    </div>
  );
}
