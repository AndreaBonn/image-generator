import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import { cancelJob, createJob, fetchTasks } from "@/api/queries";
import { useJobEvents } from "@/api/useJobEvents";
import { useImageSource } from "@/hooks/useImageSource";
import { ApiError } from "@/api/errors";
import { PromptGuide } from "@/components/create/PromptGuide";
import { ResultArea } from "@/components/create/ResultArea";
import { SeedField } from "@/components/create/SeedField";
import { ImageSourceInput } from "@/components/common/ImageSourceInput";
import { GpuWarning } from "@/components/layout/GpuWarning";
import { VariationActions } from "@/components/improve/VariationActions";
import { UpscaleAction } from "@/components/improve/UpscaleAction";
import { RemoveBackgroundAction } from "@/components/improve/RemoveBackgroundAction";
import { RefinedUpscaleAction } from "@/components/improve/RefinedUpscaleAction";
import { ImproveResultCard } from "@/components/improve/ImproveResultCard";
import type { CreateJobBody, Task } from "@/api/types";
import { PageTitle } from "@/components/layout/PageTitle";

type ImproveActionId =
  | "variazione_sottile"
  | "variazione_forte"
  | "upscale"
  | "rimuovi_sfondo"
  | "ingrandisci_rifinito";
type UpscaleFactor = 2 | 4;

const MAX_PROMPT_LENGTH = 2000;
const PROMPT_VALIDATED_ACTIONS: ImproveActionId[] = ["variazione_sottile", "variazione_forte"];

export function ImprovePage() {
  const [searchParams] = useSearchParams();
  const sourceGenerationId = searchParams.get("source");

  const { image, hasImage, isLoadingSource, isUploading, uploadError, selectFile } =
    useImageSource(sourceGenerationId);

  const tasksQuery = useQuery({ queryKey: ["tasks"], queryFn: ({ signal }) => fetchTasks(signal) });
  const improveTasks = (tasksQuery.data ?? []).filter((t) => t.group === "migliora");
  const taskById = new Map(improveTasks.map((t) => [t.id, t]));
  const subtleTask = taskById.get("variazione_sottile");
  const strongTask = taskById.get("variazione_forte");
  const upscaleTask = taskById.get("upscale");
  const removeBackgroundTask = taskById.get("rimuovi_sfondo");
  const refinedUpscaleTask = taskById.get("ingrandisci_rifinito");
  const promptGuideTask = subtleTask ?? strongTask;

  const [prompt, setPrompt] = useState("");
  const [promptError, setPromptError] = useState<string | null>(null);
  const [refinedPrompt, setRefinedPrompt] = useState("");
  const [refinedPromptError, setRefinedPromptError] = useState<string | null>(null);
  const [denoise, setDenoise] = useState<number | null>(null);
  const [seed, setSeed] = useState<number | null>(null);
  const [seedLocked, setSeedLocked] = useState(false);
  const [upscaleFactor, setUpscaleFactor] = useState<UpscaleFactor>(2);
  const [activeAction, setActiveAction] = useState<ImproveActionId | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [generationIds, setGenerationIds] = useState<string[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const { latest, latestPreviewUrl, isDone } = useJobEvents(jobId);
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
      setGenerationIds([]);
      setJobId(response.job_id);
    },
    onError: (error: unknown) => {
      setErrorMessage(error instanceof ApiError ? error.message : "Si è verificato un errore imprevisto.");
    },
  });
  const cancelMutation = useMutation({ mutationFn: cancelJob, onSettled: () => setJobId(null) });

  const isGenerating = jobMutation.isPending || (jobId !== null && !isDone);

  function disabledReasonFor(task: Task | undefined): string | null {
    if (!hasImage) return "Carica un'immagine prima di generare.";
    if (!task) return "Caricamento compiti...";
    if (!task.available) return task.unavailable_reason ?? "Compito non disponibile.";
    return null;
  }

  function buildJobBody(task: Task): CreateJobBody {
    const base: CreateJobBody = {
      task_id: task.id,
      prompt: "",
      negative_prompt: "",
      params: { seed, batch: 1, steps: null, cfg: null },
      input_upload_id: image?.uploadId ?? null,
      source_generation_id: sourceGenerationId,
    };
    switch (task.id) {
      case "upscale":
        return { ...base, upscale_factor: upscaleFactor };
      case "rimuovi_sfondo":
        return base;
      case "ingrandisci_rifinito":
        return { ...base, prompt: refinedPrompt, params: { ...base.params, denoise } };
      default:
        return { ...base, prompt };
    }
  }

  function handleAction(actionId: ImproveActionId) {
    const task = taskById.get(actionId);
    if (!task || disabledReasonFor(task) !== null || isGenerating) return;

    if (PROMPT_VALIDATED_ACTIONS.includes(actionId) && prompt.length > MAX_PROMPT_LENGTH) {
      setPromptError(`La descrizione supera i ${MAX_PROMPT_LENGTH} caratteri.`);
      return;
    }
    if (actionId === "ingrandisci_rifinito" && refinedPrompt.length > MAX_PROMPT_LENGTH) {
      setRefinedPromptError(`La descrizione supera i ${MAX_PROMPT_LENGTH} caratteri.`);
      return;
    }
    setPromptError(null);
    setRefinedPromptError(null);
    setActiveAction(actionId);
    jobMutation.mutate(buildJobBody(task));
  }

  function handleRetry() {
    if (activeAction) handleAction(activeAction);
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div className="flex flex-col gap-4">
        <PageTitle>Migliora</PageTitle>

        {isLoadingSource ? <p className="text-sm text-ink-muted">Caricamento immagine...</p> : null}

        {image ? (
          <figure className="flex flex-col gap-1">
            <img
              src={image.url}
              alt="Immagine di partenza"
              className="max-h-80 w-full rounded-md border border-border bg-paper-2 object-contain"
            />
            <figcaption className="text-xs text-ink-muted">Immagine di partenza</figcaption>
          </figure>
        ) : null}

        {!hasImage && !isLoadingSource ? (
          <div className="flex flex-col gap-2">
            <p className="text-sm text-ink-muted">
              Carica un&apos;immagine per creare una variazione o ingrandirla. Puoi anche scegliere
              &quot;Migliora&quot; dal dettaglio di un&apos;immagine in Galleria.
            </p>
            <ImageSourceInput
              isUploading={isUploading}
              uploadError={uploadError}
              disabled={sourceGenerationId !== null}
              inputLabel="Scegli un'immagine da migliorare"
              onFileSelected={selectFile}
            />
          </div>
        ) : null}

        {promptGuideTask ? (
          <>
            <PromptGuide
              promptLanguage={promptGuideTask.prompt_language}
              tips={promptGuideTask.prompt_tips}
              examples={promptGuideTask.prompt_examples}
              prompt={prompt}
              onUseExample={setPrompt}
            />
            <div className="flex flex-col gap-1">
              <label htmlFor="improve-prompt-input" className="text-sm font-semibold text-ink">
                Descrizione (facoltativa)
              </label>
              <textarea
                id="improve-prompt-input"
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                rows={3}
                maxLength={MAX_PROMPT_LENGTH}
                className="rounded-md border border-border bg-paper-2 px-2 py-1 text-sm text-ink"
                aria-invalid={promptError !== null}
                aria-describedby={promptError ? "improve-prompt-error" : undefined}
              />
              {promptError ? (
                <p id="improve-prompt-error" role="alert" className="text-sm text-danger">
                  {promptError}
                </p>
              ) : null}
            </div>
          </>
        ) : null}

        <SeedField seed={seed} locked={seedLocked} onChange={setSeed} onToggleLocked={setSeedLocked} />

        <GpuWarning />

        <VariationActions
          subtleDisabledReason={disabledReasonFor(subtleTask)}
          strongDisabledReason={disabledReasonFor(strongTask)}
          isGenerating={isGenerating}
          activeAction={activeAction}
          onSelect={handleAction}
        />

        <UpscaleAction
          factor={upscaleFactor}
          onFactorChange={setUpscaleFactor}
          disabledReason={disabledReasonFor(upscaleTask)}
          isGenerating={isGenerating}
          isActive={activeAction === "upscale"}
          onClick={() => handleAction("upscale")}
        />

        <RemoveBackgroundAction
          disabledReason={disabledReasonFor(removeBackgroundTask)}
          isGenerating={isGenerating}
          isActive={activeAction === "rimuovi_sfondo"}
          onClick={() => handleAction("rimuovi_sfondo")}
        />

        <RefinedUpscaleAction
          task={refinedUpscaleTask}
          prompt={refinedPrompt}
          promptError={refinedPromptError}
          onPromptChange={setRefinedPrompt}
          denoise={denoise}
          onDenoiseChange={setDenoise}
          disabledReason={disabledReasonFor(refinedUpscaleTask)}
          isGenerating={isGenerating}
          isActive={activeAction === "ingrandisci_rifinito"}
          onClick={() => handleAction("ingrandisci_rifinito")}
        />
      </div>

      <div className="flex flex-col gap-4">
        <ResultArea
          latestEvent={latest}
          previewUrl={latestPreviewUrl}
          generationIds={[]}
          hasExternalResults={generationIds.length > 0}
          errorMessage={errorMessage}
          isRunning={jobId !== null}
          onRetry={handleRetry}
          onCancel={() => jobId && cancelMutation.mutate(jobId)}
        />

        {image && generationIds.length > 0 ? (
          <div className="flex flex-col gap-4">
            {generationIds.map((id) => (
              <ImproveResultCard
                key={id}
                generationId={id}
                beforeUrl={image.url}
                transparentAfter={activeAction === "rimuovi_sfondo"}
              />
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
