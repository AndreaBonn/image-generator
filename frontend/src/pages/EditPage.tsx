import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import { cancelJob, createJob, fetchGeneration, fetchTasks, imageUrl, uploadFile } from "@/api/queries";
import { useJobEvents } from "@/api/useJobEvents";
import { ApiError } from "@/api/errors";
import { PromptGuide } from "@/components/create/PromptGuide";
import { ResultArea } from "@/components/create/ResultArea";
import { ImageInput } from "@/components/edit/ImageInput";
import { MaskEditor } from "@/components/edit/MaskEditor";
import { OutpaintPanel } from "@/components/edit/OutpaintPanel";
import { EditModeTabs, type EditMode } from "@/components/edit/EditModeTabs";
import { parseEditMode } from "@/lib/editMode";
import { FreeEditOptions } from "@/components/edit/FreeEditOptions";
import { GpuWarning } from "@/components/layout/GpuWarning";
import { exportMaskPng } from "@/lib/maskExport";
import { isMaskEmpty } from "@/lib/mask";
import { toggleDirection, type OutpaintDirection } from "@/lib/outpaint";
import type { CreateJobBody, Task } from "@/api/types";
import { PageTitle } from "@/components/layout/PageTitle";

const MAX_PROMPT_LENGTH = 2000;
const INPAINT_REQUIRED_MESSAGE = "Descrivi cosa deve apparire nella zona scelta.";
const FREE_EDIT_REQUIRED_MESSAGE = "Descrivi il cambiamento da applicare all'immagine.";

interface SourceImage {
  url: string;
  width: number;
  height: number;
  uploadId: string | null;
}

/** Keyed on the source image: editing a result starts a fresh step (empty prompt, no stale result). */
export function EditPage() {
  const [searchParams] = useSearchParams();
  return <EditWorkspace key={searchParams.get("source") ?? "upload"} />;
}

function EditWorkspace() {
  const [searchParams] = useSearchParams();
  const sourceGenerationId = searchParams.get("source");
  const [mode, setMode] = useState<EditMode>(() => parseEditMode(searchParams.get("mode")) ?? "inpaint");
  const [image, setImage] = useState<SourceImage | null>(null);
  const [mask, setMask] = useState<Uint8Array | null>(null);
  const [directions, setDirections] = useState<OutpaintDirection[]>([]);
  const [prompt, setPrompt] = useState("");
  const [promptError, setPromptError] = useState<string | null>(null);
  const [seed, setSeed] = useState<number | null>(null);
  const [seedLocked, setSeedLocked] = useState(false);
  const [steps, setSteps] = useState<number | null>(null);
  const [cfg, setCfg] = useState<number | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [generationIds, setGenerationIds] = useState<string[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isPreparingMask, setIsPreparingMask] = useState(false);

  const tasksQuery = useQuery({ queryKey: ["tasks"], queryFn: ({ signal }) => fetchTasks(signal) });
  const editTasks = useMemo(
    () => (tasksQuery.data ?? []).filter((t) => t.group === "modifica"),
    [tasksQuery.data],
  );
  const selectedTask: Task | undefined = editTasks.find((t) => t.id === mode);

  const sourceQuery = useQuery({
    queryKey: ["generation", sourceGenerationId],
    queryFn: ({ signal }) => fetchGeneration(sourceGenerationId as string, signal),
    enabled: sourceGenerationId !== null,
  });

  useEffect(() => {
    if (sourceQuery.data) {
      setImage({
        url: imageUrl(sourceQuery.data.id),
        width: sourceQuery.data.width,
        height: sourceQuery.data.height,
        uploadId: null,
      });
    }
  }, [sourceQuery.data]);

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

  const uploadImageMutation = useMutation({
    mutationFn: (file: File) => uploadFile(file, "image"),
    onSuccess: (result, file) => {
      setImage({ url: URL.createObjectURL(file), width: result.width, height: result.height, uploadId: result.upload_id });
      setMask(null);
      setErrorMessage(null);
    },
    onError: () => setErrorMessage("Impossibile caricare l'immagine. Verifica formato e dimensione."),
  });

  const maskIsEmpty = mask === null || isMaskEmpty(mask);
  const hasImage = image !== null;
  const taskUnavailable = selectedTask !== undefined && !selectedTask.available;

  const disabledReason = taskUnavailable
    ? selectedTask?.unavailable_reason
    : !hasImage
      ? "Carica un'immagine prima di generare."
      : mode === "inpaint" && maskIsEmpty
        ? "Disegna la zona da modificare prima di generare."
        : mode === "outpaint" && directions.length === 0
          ? "Scegli almeno una direzione prima di generare."
          : null;

  const canSubmit = disabledReason === null && !isPreparingMask;

  function handleModeChange(next: EditMode) {
    setMode(next);
    setPromptError(null);
  }

  function validatePrompt(required: boolean, requiredMessage: string): boolean {
    if (required && prompt.trim().length === 0) {
      setPromptError(requiredMessage);
      return false;
    }
    if (prompt.length > MAX_PROMPT_LENGTH) {
      setPromptError(`La descrizione supera i ${MAX_PROMPT_LENGTH} caratteri.`);
      return false;
    }
    setPromptError(null);
    return true;
  }

  function baseJobBody(taskId: string, overrides: Partial<CreateJobBody> = {}): CreateJobBody {
    return {
      task_id: taskId,
      prompt,
      negative_prompt: "",
      params: { seed: null, batch: 1, steps: null, cfg: null },
      input_upload_id: image?.uploadId ?? null,
      source_generation_id: sourceGenerationId,
      ...overrides,
    };
  }

  async function handleSubmit() {
    if (!selectedTask || !image || !canSubmit) return;

    if (mode === "modifica_libera") {
      if (!validatePrompt(true, FREE_EDIT_REQUIRED_MESSAGE)) return;
      jobMutation.mutate(baseJobBody(selectedTask.id, { params: { seed, batch: 1, steps, cfg } }));
      return;
    }

    if (mode === "inpaint") {
      if (!validatePrompt(true, INPAINT_REQUIRED_MESSAGE) || !mask) return;
      setIsPreparingMask(true);
      try {
        const blob = await exportMaskPng(mask, image.width, image.height);
        const maskFile = new File([blob], "mask.png", { type: "image/png" });
        const uploaded = await uploadFile(maskFile, "mask");
        jobMutation.mutate({ ...baseJobBody(selectedTask.id), mask_upload_id: uploaded.upload_id });
      } catch {
        setErrorMessage("Impossibile preparare la maschera. Riprova.");
      } finally {
        setIsPreparingMask(false);
      }
      return;
    }

    if (!validatePrompt(false, INPAINT_REQUIRED_MESSAGE)) return;
    jobMutation.mutate({ ...baseJobBody(selectedTask.id), outpaint_directions: directions });
  }

  const isGenerating = jobMutation.isPending || isPreparingMask || (jobId !== null && !isDone);

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div className="flex flex-col gap-4">
        <PageTitle>Modifica</PageTitle>

        <EditModeTabs mode={mode} onSelect={handleModeChange} />

        {!hasImage ? (
          <ImageInput onFileSelected={(file) => uploadImageMutation.mutate(file)} disabled={sourceGenerationId !== null} />
        ) : null}

        {uploadImageMutation.isError ? (
          <p role="alert" className="text-sm text-danger">
            Impossibile caricare l&apos;immagine. Verifica formato e dimensione.
          </p>
        ) : null}

        {hasImage && mode === "inpaint" ? (
          <MaskEditor imageUrl={image.url} width={image.width} height={image.height} onMaskChange={setMask} />
        ) : null}

        {hasImage && mode === "outpaint" ? (
          <OutpaintPanel
            imageUrl={image.url}
            width={image.width}
            height={image.height}
            directions={directions}
            onToggle={(direction) => setDirections((prev) => toggleDirection(prev, direction))}
          />
        ) : null}

        {hasImage && mode === "modifica_libera" ? <img src={image.url} alt="Immagine da modificare" className="h-auto max-h-[50vh] w-full rounded-md object-contain" /> : null}
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
              <label htmlFor="edit-prompt-input" className="text-sm font-semibold text-ink">
                Descrizione
              </label>
              <textarea
                id="edit-prompt-input"
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                rows={3}
                maxLength={MAX_PROMPT_LENGTH}
                className="rounded-md border border-border bg-paper-2 px-2 py-1 text-sm text-ink"
                aria-invalid={promptError !== null}
                aria-describedby={promptError ? "edit-prompt-error" : undefined}
              />
              {promptError ? (
                <p id="edit-prompt-error" role="alert" className="text-sm text-danger">
                  {promptError}
                </p>
              ) : null}
            </div>

            {mode === "modifica_libera" ? (
              <FreeEditOptions
                task={selectedTask}
                seed={seed}
                seedLocked={seedLocked}
                onSeedChange={setSeed}
                onToggleSeedLocked={setSeedLocked}
                steps={steps}
                cfg={cfg}
                onStepsChange={setSteps}
                onCfgChange={setCfg}
              />
            ) : null}
          </>
        ) : null}

        <GpuWarning />

        <div className="flex flex-col gap-1">
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!canSubmit || isGenerating}
            className="min-h-11 w-fit rounded-md bg-accent px-4 py-2 text-sm font-semibold text-accent-ink disabled:cursor-not-allowed disabled:bg-paper-3 disabled:text-ink-muted"
          >
            {isGenerating ? "Generazione in corso..." : "Genera"}
          </button>
          {disabledReason && !isGenerating ? (
            <p className="text-xs text-ink-muted">{disabledReason}</p>
          ) : null}
        </div>
      </div>

      <ResultArea
        latestEvent={latest}
        previewUrl={latestPreviewUrl}
        generationIds={generationIds}
        errorMessage={errorMessage}
        isRunning={jobId !== null}
        onRetry={handleSubmit}
        onCancel={() => jobId && cancelMutation.mutate(jobId)}
      />
    </div>
  );
}
