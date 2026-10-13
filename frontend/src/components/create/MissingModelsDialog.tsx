import { useCallback, useEffect, useRef, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchSystem } from "@/api/queries";
import type { DiskInfo, ModelInfo, Task } from "@/api/types";
import { DownloadProgress } from "@/components/settings/ModelDownloadButton";
import { useModalFocus } from "@/hooks/useModalFocus";
import { useModelQueue, type UseModelQueueResult } from "@/hooks/useModelQueue";
import { formatSizeGb } from "@/lib/format";
import { planMissingModels, type MissingModelsPlan } from "@/lib/missingModels";

interface MissingModelsDialogProps {
  task: Task;
  onClose: () => void;
  /** Called once every model is installed and /tasks has been refetched (the task may
   * still read unavailable if that refetch failed: callers check before selecting it). */
  onInstalled: (taskId: string) => void;
}

const SECONDARY_BUTTON = "min-h-11 rounded-md border border-border px-3 py-2 text-sm text-ink";
const PRIMARY_BUTTON =
  "min-h-11 rounded-md border border-accent bg-paper-2 px-3 py-2 text-sm font-semibold text-accent-text";

/**
 * Offers to install the models a task is missing, then downloads them one at a
 * time with the same SSE flow as Impostazioni (SPEC.md § 11.2, FN16). The dialog
 * cannot be dismissed mid-download: Annulla on the progress bar stops it instead.
 */
export function MissingModelsDialog({ task, onClose, onInstalled }: MissingModelsDialogProps) {
  const systemQuery = useQuery({ queryKey: ["system"], queryFn: ({ signal }) => fetchSystem(signal) });
  const queueApi = useModelQueue();
  const running = queueApi.queue.phase === "running";
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const dismiss = useCallback(() => {
    if (!running) onClose();
  }, [running, onClose]);
  useModalFocus(dialogRef, dismiss);
  const alreadyInstalled =
    queueApi.queue.phase === "idle" &&
    systemQuery.data !== undefined &&
    planMissingModels({ task, models: systemQuery.data.models, disk: systemQuery.data.disk }).allInstalled;
  useNotifyWhenInstalled(queueApi.queue.phase === "done" || alreadyInstalled, task.id, onInstalled);
  useRefreshSystemOnEachModel(queueApi.download.state.phase === "completed");
  const titleId = `missing-models-title-${task.id}`;

  return (
    <div className="fixed inset-0 z-modal flex items-center justify-center p-4">
      <button type="button" onClick={dismiss} aria-label="Annulla" className="absolute inset-0 bg-black/60" />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="relative flex w-full max-w-md flex-col gap-3 rounded-md border border-border bg-paper p-4"
      >
        <h2 id={titleId} className="text-base font-semibold text-ink">
          Scaricare i modelli per «{task.label}»?
        </h2>
        {systemQuery.isPending ? (
          <p className="text-sm text-ink-muted">Controllo i modelli...</p>
        ) : systemQuery.isError ? (
          <Notice onClose={onClose}>Non riesco a leggere lo stato dei modelli. Riprova tra poco.</Notice>
        ) : (
          <DialogBody
            task={task}
            models={systemQuery.data.models}
            disk={systemQuery.data.disk}
            queueApi={queueApi}
            onClose={onClose}
          />
        )}
      </div>
    </div>
  );
}

/** Refetches /system and /tasks after the last model, then hands the task back. */
function useNotifyWhenInstalled(isDone: boolean, taskId: string, onInstalled: (taskId: string) => void): void {
  const queryClient = useQueryClient();
  const onInstalledRef = useRef(onInstalled);
  onInstalledRef.current = onInstalled;
  useEffect(() => {
    if (!isDone) return;
    void Promise.all([
      queryClient.invalidateQueries({ queryKey: ["system"] }),
      queryClient.invalidateQueries({ queryKey: ["tasks"] }),
    ]).then(() => onInstalledRef.current(taskId));
  }, [isDone, taskId, queryClient]);
}

/** Refreshes /system after every finished model, so a cancelled queue never re-offers it. */
function useRefreshSystemOnEachModel(isCompleted: boolean): void {
  const queryClient = useQueryClient();
  useEffect(() => {
    if (isCompleted) void queryClient.invalidateQueries({ queryKey: ["system"] });
  }, [isCompleted, queryClient]);
}

interface DialogBodyProps {
  task: Task;
  models: ModelInfo[];
  disk: DiskInfo;
  queueApi: UseModelQueueResult;
  onClose: () => void;
}

function DialogBody({ task, models, disk, queueApi, onClose }: DialogBodyProps) {
  const { queue, download, startAll, retry } = queueApi;
  const labels = new Map(models.map((model) => [model.id, model]));
  const plan = planMissingModels({ task, models, disk });
  const otherDownloadActive =
    queue.phase === "idle" && (download.state.phase === "downloading" || download.state.phase === "verifying");

  if (queue.phase === "done" || (queue.phase === "idle" && plan.allInstalled)) {
    return <p className="text-sm font-medium text-success">Modelli installati.</p>;
  }
  if (queue.phase === "running") {
    const currentId = queue.ids[queue.index] ?? "";
    const current = labels.get(currentId);
    return (
      <div className="flex flex-col gap-2">
        <p className="text-sm text-ink">
          Modello {queue.index + 1} di {queue.ids.length}: {current?.label ?? currentId}
        </p>
        {current ? <DownloadProgress model={current} state={download.state} onCancel={download.cancel} /> : null}
        {download.connectionLost ? (
          <p role="status" className="text-sm text-warning">
            Connessione con l&apos;app interrotta: riprovo...
          </p>
        ) : null}
      </div>
    );
  }
  if (queue.phase === "failed") {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-sm text-danger">{download.state.error?.message ?? "Download non riuscito."}</p>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className={SECONDARY_BUTTON}>
            Chiudi
          </button>
          <button type="button" onClick={retry} className={PRIMARY_BUTTON}>
            Riprova
          </button>
        </div>
      </div>
    );
  }
  if (otherDownloadActive) {
    return (
      <Notice onClose={onClose}>
        È in corso il download di un altro modello. Attendi che finisca, poi riapri questo compito.
      </Notice>
    );
  }
  if (!plan.downloadable) {
    return <Notice onClose={onClose}>{task.unavailable_reason ?? "Questi modelli non si possono scaricare dall'app."}</Notice>;
  }
  return <ConfirmBody plan={plan} disk={disk} onClose={onClose} onConfirm={() => startAll(plan.models.map((m) => m.id))} />;
}

function ConfirmBody({
  plan,
  disk,
  onClose,
  onConfirm,
}: {
  plan: MissingModelsPlan;
  disk: DiskInfo;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <>
      <ul className="flex flex-col gap-1 text-sm text-ink">
        {plan.models.map((model) => (
          <li key={model.id} className="flex justify-between gap-2">
            <span>{model.label}</span>
            <span className="text-ink-muted">{model.size_gb !== null ? formatSizeGb(model.size_gb) : "dimensione ignota"}</span>
          </li>
        ))}
      </ul>
      <p className="text-sm text-ink-muted">
        {plan.totalGb === null
          ? "La dimensione del download non è nota in anticipo."
          : plan.shortOfSpace
            ? `Servono ${formatSizeGb(plan.totalGb)} più ${formatSizeGb(disk.min_free_gb)} di margine, liberi ${formatSizeGb(disk.free_gb)}.`
            : `Verranno scaricati ${formatSizeGb(plan.totalGb)}. Dopo il download resteranno liberi ${formatSizeGb(disk.free_gb - plan.totalGb)}.`}
      </p>
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onClose} className={SECONDARY_BUTTON}>
          Annulla
        </button>
        {plan.shortOfSpace ? null : (
          <button type="button" onClick={onConfirm} className={PRIMARY_BUTTON}>
            Scarica
          </button>
        )}
      </div>
    </>
  );
}

function Notice({ children, onClose }: { children: ReactNode; onClose: () => void }) {
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-ink-muted">{children}</p>
      <div className="flex justify-end">
        <button type="button" onClick={onClose} className={SECONDARY_BUTTON}>
          Chiudi
        </button>
      </div>
    </div>
  );
}
