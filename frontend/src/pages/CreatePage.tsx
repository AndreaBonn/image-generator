import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { fetchTasks, createJob, cancelJob } from "@/api/queries";
import { useJobEvents } from "@/api/useJobEvents";
import { ApiError } from "@/api/errors";
import { TaskSelector } from "@/components/create/TaskSelector";
import { PromptGuide } from "@/components/create/PromptGuide";
import { AspectRatioPicker } from "@/components/create/AspectRatioPicker";
import { SeedField } from "@/components/create/SeedField";
import { StyleSelector } from "@/components/create/StyleSelector";
import { AdvancedOptions } from "@/components/create/AdvancedOptions";
import { ResultArea } from "@/components/create/ResultArea";
import type { Task } from "@/api/types";

const MAX_PROMPT_LENGTH = 2000;
const MIN_BATCH = 1;
const MAX_BATCH = 4;

export function CreatePage() {
  const tasksQuery = useQuery({ queryKey: ["tasks"], queryFn: ({ signal }) => fetchTasks(signal) });
  const creationTasks = useMemo(
    () => (tasksQuery.data ?? []).filter((t) => t.group === "crea"),
    [tasksQuery.data],
  );

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

  const { latest, isDone } = useJobEvents(jobId);

  useEffect(() => {
    if (!latest) return;
    if (latest.type === "completed") {
      setGenerationIds(latest.generation_ids);
      setJobId(null);
    } else if (latest.type === "failed") {
      setErrorMessage(latest.message);
      setJobId(null);
    } else if (latest.type === "cancelled") {
      setJobId(null);
    }
  }, [latest]);

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

  function handleSelectTask(id: string) {
    setTaskId(id);
    const task = creationTasks.find((t) => t.id === id);
    if (task) {
      setAspectRatio(task.default_aspect_ratio);
      setStyleIds(task.default_styles);
    }
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

            <AspectRatioPicker ratios={selectedTask.aspect_ratios} value={aspectRatio} onChange={setAspectRatio} />

            <label className="flex flex-col gap-1 text-sm text-ink">
              Numero di immagini
              <input
                type="number"
                min={MIN_BATCH}
                max={MAX_BATCH}
                value={batch}
                onChange={(event) =>
                  setBatch(Math.min(MAX_BATCH, Math.max(MIN_BATCH, Number(event.target.value))))
                }
                className="min-h-11 w-24 rounded-md border border-border bg-paper-2 px-2 py-1"
              />
            </label>

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

            <button
              type="button"
              onClick={handleSubmit}
              disabled={jobMutation.isPending || jobId !== null}
              className="min-h-11 w-fit rounded-md bg-accent px-4 py-2 text-sm font-semibold text-accent-ink disabled:opacity-60"
            >
              {jobMutation.isPending || (jobId !== null && !isDone) ? "Generazione in corso..." : "Genera"}
            </button>
          </>
        ) : null}
      </div>

      <ResultArea
        latestEvent={latest}
        generationIds={generationIds}
        errorMessage={errorMessage}
        isRunning={jobId !== null}
        onRetry={handleSubmit}
        onCancel={() => jobId && cancelMutation.mutate(jobId)}
      />
    </div>
  );
}
