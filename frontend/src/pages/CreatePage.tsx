import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchTasks, fetchExamples, fetchSystem, createJob, cancelJob } from "@/api/queries";
import { useJobEvents } from "@/api/useJobEvents";
import { ApiError } from "@/api/errors";
import { TaskSelector } from "@/components/create/TaskSelector";
import { CreateForm } from "@/components/create/CreateForm";
import { ResultArea } from "@/components/create/ResultArea";
import { ExamplesPanel, type TryExamplePatch } from "@/components/create/ExamplesPanel";
import { MAX_PROMPT_LENGTH } from "@/lib/createFormLimits";
import type { RecipeImportPatch } from "@/lib/recipeImport";
import type { Task } from "@/api/types";
import { useReferences } from "@/hooks/useReferences";
import { PageTitle } from "@/components/layout/PageTitle";
import { italianFriendlyTask } from "@/lib/taskGroups";

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
  // Same cache entry as GpuWarning: which model family is already in GPU memory (C4).
  const systemQuery = useQuery({ queryKey: ["system"], queryFn: ({ signal }) => fetchSystem(signal) });
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

  const selectedTask: Task | undefined = creationTasks.find((t) => t.id === taskId);
  const italianTask = italianFriendlyTask(creationTasks);
  const {
    references,
    setReferences,
    referencesNotice,
    setReferencesNotice,
    requiresReferences,
    minReferences,
    missingReferences,
    canSketch,
    sketchInProgress,
    setSketchDirty,
    resetReferences,
  } = useReferences(selectedTask);

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
    resetReferences();
    generateButtonRef.current?.focus();
  }

  function handleSelectTask(id: string) {
    setTaskId(id);
    const task = creationTasks.find((t) => t.id === id);
    if (task) {
      setAspectRatio(task.default_aspect_ratio);
      setStyleIds(task.default_styles);
    }
    resetReferences();
  }

  function validate(): boolean {
    if (prompt.trim().length === 0) {
      setPromptError("Scrivi una descrizione prima di generare.");
      return false;
    }
    if (prompt.length > MAX_PROMPT_LENGTH) {
      setPromptError(`La descrizione supera i ${MAX_PROMPT_LENGTH} caratteri.`);
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
        <PageTitle>Crea</PageTitle>
        <TaskSelector
          tasks={creationTasks}
          selectedTaskId={taskId}
          onSelect={handleSelectTask}
          loadedFamily={systemQuery.data?.loaded_family ?? null}
        />

        {selectedTask ? (
          <CreateForm
            selectedTask={selectedTask}
            creationTasks={creationTasks}
            prompt={prompt}
            onPromptChange={setPrompt}
            promptError={promptError}
            negativePrompt={negativePrompt}
            onNegativePromptChange={setNegativePrompt}
            aspectRatio={aspectRatio}
            onAspectRatioChange={setAspectRatio}
            batch={batch}
            onBatchChange={setBatch}
            styleIds={styleIds}
            onStyleIdsChange={setStyleIds}
            seed={seed}
            seedLocked={seedLocked}
            onSeedChange={setSeed}
            onSeedLockedChange={setSeedLocked}
            steps={steps}
            cfg={cfg}
            onStepsChange={setSteps}
            onCfgChange={setCfg}
            onApplyRecipe={handleApplyRecipe}
            references={references}
            onReferencesChange={setReferences}
            referencesNotice={referencesNotice}
            requiresReferences={requiresReferences}
            minReferences={minReferences}
            missingReferences={missingReferences}
            canSketch={canSketch}
            sketchInProgress={sketchInProgress}
            onSketchDirtyChange={setSketchDirty}
            onSubmit={handleSubmit}
            submitDisabled={jobMutation.isPending || jobId !== null || missingReferences}
            submitLabel={jobMutation.isPending || (jobId !== null && !isDone) ? "Generazione in corso..." : "Genera"}
            generateButtonRef={generateButtonRef}
            italianAlternative={
              italianTask ? { label: italianTask.label, onSwitch: () => handleSelectTask(italianTask.id) } : null
            }
          />
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
