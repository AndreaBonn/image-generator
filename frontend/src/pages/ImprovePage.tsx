import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import { cancelJob, createJob, fetchTasks } from "@/api/queries";
import { useJobEvents } from "@/api/useJobEvents";
import { useImageSource } from "@/hooks/useImageSource";
import { ApiError } from "@/api/errors";
import { PromptGuide } from "@/components/create/PromptGuide";
import { ResultArea, ResultCardActions } from "@/components/create/ResultArea";
import { SeedField } from "@/components/create/SeedField";
import { ImageSourceInput } from "@/components/common/ImageSourceInput";
import { BeforeAfterSlider } from "@/components/common/BeforeAfterSlider";
import { GpuWarning } from "@/components/layout/GpuWarning";
import type { CreateJobBody, Task } from "@/api/types";

type ImproveActionId = "variazione_sottile" | "variazione_forte" | "upscale";
type UpscaleFactor = 2 | 4;

const MAX_PROMPT_LENGTH = 2000;

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
  const promptGuideTask = subtleTask ?? strongTask;

  const [prompt, setPrompt] = useState("");
  const [promptError, setPromptError] = useState<string | null>(null);
  const [seed, setSeed] = useState<number | null>(null);
  const [seedLocked, setSeedLocked] = useState(false);
  const [upscaleFactor, setUpscaleFactor] = useState<UpscaleFactor>(2);
  const [activeAction, setActiveAction] = useState<ImproveActionId | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [generationIds, setGenerationIds] = useState<string[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

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
    const isUpscale = task.id === "upscale";
    const base: CreateJobBody = {
      task_id: task.id,
      prompt: isUpscale ? "" : prompt,
      negative_prompt: "",
      params: { seed, batch: 1, steps: null, cfg: null },
      input_upload_id: image?.uploadId ?? null,
      source_generation_id: sourceGenerationId,
    };
    return isUpscale ? { ...base, upscale_factor: upscaleFactor } : base;
  }

  function handleAction(actionId: ImproveActionId) {
    const task = taskById.get(actionId);
    if (!task || disabledReasonFor(task) !== null || isGenerating) return;

    if (actionId !== "upscale" && prompt.length > MAX_PROMPT_LENGTH) {
      setPromptError(`Il prompt supera i ${MAX_PROMPT_LENGTH} caratteri.`);
      return;
    }
    setPromptError(null);
    setActiveAction(actionId);
    jobMutation.mutate(buildJobBody(task));
  }

  function handleRetry() {
    if (activeAction) handleAction(activeAction);
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div className="flex flex-col gap-4">
        <h1 className="text-xl font-semibold text-ink">Migliora</h1>

        {isLoadingSource ? <p className="text-sm text-ink-muted">Caricamento immagine...</p> : null}

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

        <div className="flex flex-col gap-1">
          <ActionButton
            label="Variazione leggera"
            disabledReason={disabledReasonFor(subtleTask)}
            isGenerating={isGenerating}
            onClick={() => handleAction("variazione_sottile")}
          />
          <ActionButton
            label="Variazione forte"
            disabledReason={disabledReasonFor(strongTask)}
            isGenerating={isGenerating}
            onClick={() => handleAction("variazione_forte")}
          />
        </div>

        <fieldset className="flex flex-col gap-2">
          <legend className="text-sm font-semibold text-ink">Ingrandisci</legend>
          <div role="radiogroup" aria-label="Fattore di ingrandimento" className="flex gap-2">
            <FactorButton factor={2} selected={upscaleFactor === 2} onSelect={setUpscaleFactor} />
            <FactorButton factor={4} selected={upscaleFactor === 4} onSelect={setUpscaleFactor} />
          </div>
          <ActionButton
            label="Ingrandisci"
            disabledReason={disabledReasonFor(upscaleTask)}
            isGenerating={isGenerating}
            onClick={() => handleAction("upscale")}
          />
        </fieldset>
      </div>

      <div className="flex flex-col gap-4">
        <ResultArea
          latestEvent={latest}
          generationIds={[]}
          errorMessage={errorMessage}
          isRunning={jobId !== null}
          onRetry={handleRetry}
          onCancel={() => jobId && cancelMutation.mutate(jobId)}
        />

        {image && generationIds.length > 0 ? (
          <div className="flex flex-col gap-4">
            {generationIds.map((id) => (
              <ImproveResultCard key={id} generationId={id} beforeUrl={image.url} />
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function ImproveResultCard({ generationId, beforeUrl }: { generationId: string; beforeUrl: string }) {
  return (
    <div className="flex flex-col gap-2 rounded-md border border-border bg-paper-2 p-2">
      <BeforeAfterSlider
        beforeUrl={beforeUrl}
        afterUrl={`/api/v1/generations/${generationId}/image`}
        sliderId={`before-after-${generationId}`}
      />
      <ResultCardActions generationId={generationId} />
    </div>
  );
}

function ActionButton({
  label,
  disabledReason,
  isGenerating,
  onClick,
}: {
  label: string;
  disabledReason: string | null;
  isGenerating: boolean;
  onClick: () => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        onClick={onClick}
        disabled={disabledReason !== null || isGenerating}
        className="min-h-11 w-fit rounded-md bg-accent px-4 py-2 text-sm font-semibold text-accent-ink disabled:opacity-60"
      >
        {isGenerating ? "Generazione in corso..." : label}
      </button>
      {disabledReason && !isGenerating ? <p className="text-xs text-ink-muted">{disabledReason}</p> : null}
    </div>
  );
}

function FactorButton({
  factor,
  selected,
  onSelect,
}: {
  factor: UpscaleFactor;
  selected: boolean;
  onSelect: (factor: UpscaleFactor) => void;
}) {
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
