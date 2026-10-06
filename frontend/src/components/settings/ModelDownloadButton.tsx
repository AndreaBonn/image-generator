import { useState } from "react";
import type { DiskInfo, ModelInfo } from "@/api/types";
import type { ModelDownloadState, UseModelDownloadResult } from "@/hooks/useModelDownload";
import { formatSizeGb } from "@/lib/format";
import { needsMoreSpace } from "@/lib/modelDownloadSpace";
import { ModelInstallConfirmDialog } from "@/components/settings/ModelInstallConfirmDialog";

interface ModelDownloadButtonProps {
  model: ModelInfo;
  disk: DiskInfo;
  /** Single hook instance shared by every row (ModelsTable): only one model
   * downloads app-wide, so every other row disables itself while it runs. */
  download: UseModelDownloadResult;
}

/**
 * Download affordance for a missing+enabled model (SPEC.md § 11.2, backend
 * T026-T028). States: idle, disabled for lack of disk space, downloading
 * with a progress bar and Annulla, verifying, error with Riprova, and a
 * brief "Installato" before the parent's /system and /tasks queries
 * refetch and the row's own status flips to "installed".
 */
export function ModelDownloadButton({ model, disk, download }: ModelDownloadButtonProps) {
  const { state, start, cancel } = download;
  const [confirming, setConfirming] = useState(false);
  const isThisModel = state.modelId === model.id;
  const otherDownloadActive =
    !isThisModel && (state.phase === "downloading" || state.phase === "verifying");

  if (isThisModel && state.phase === "completed") {
    return <span className="text-sm font-medium text-success">Installato</span>;
  }

  if (isThisModel && (state.phase === "downloading" || state.phase === "verifying")) {
    return <DownloadProgress model={model} state={state} onCancel={cancel} />;
  }

  if (isThisModel && state.phase === "failed") {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm text-danger">{state.error?.message ?? "Download non riuscito."}</p>
        <button
          type="button"
          onClick={() => start(model.id)}
          className="min-h-11 rounded-md border border-border px-3 py-2 text-sm text-ink"
        >
          Riprova
        </button>
      </div>
    );
  }

  if (otherDownloadActive) {
    return (
      <p className="text-sm text-ink-muted">
        È in corso il download di un altro modello. Attendi che finisca.
      </p>
    );
  }

  const neededGb = model.size_gb;
  const short =
    neededGb !== null && needsMoreSpace({ freeGb: disk.free_gb, neededGb, minFreeGb: disk.min_free_gb });

  if (short) {
    return (
      <p className="text-sm text-ink-muted">
        Servono {formatSizeGb(neededGb as number)} più {formatSizeGb(disk.min_free_gb)} di margine,
        liberi {formatSizeGb(disk.free_gb)}.
      </p>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="min-h-11 rounded-md border border-accent bg-paper-2 px-3 py-2 text-sm font-semibold text-accent-text"
      >
        Installa{neededGb !== null ? ` · ${formatSizeGb(neededGb)}` : ""}
      </button>
      {confirming ? (
        <ModelInstallConfirmDialog
          model={model}
          disk={disk}
          onCancel={() => setConfirming(false)}
          onConfirm={() => {
            setConfirming(false);
            void start(model.id);
          }}
        />
      ) : null}
    </>
  );
}

function DownloadProgress({
  model,
  state,
  onCancel,
}: {
  model: ModelInfo;
  state: ModelDownloadState;
  onCancel: () => void;
}) {
  if (state.phase === "verifying") {
    return <p className="text-sm text-ink-muted">Verifica in corso...</p>;
  }

  const total = state.total ?? 0;
  const bytes = state.bytes ?? 0;
  const percent = total > 0 ? Math.min(100, Math.round((bytes / total) * 100)) : 0;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div
        role="progressbar"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`Download di ${model.label}`}
        className="h-2 w-32 overflow-hidden rounded-full bg-paper-3"
      >
        <div className="h-full bg-accent" style={{ width: `${percent}%` }} />
      </div>
      <span className="text-sm text-ink-muted">{percent}%</span>
      <button
        type="button"
        onClick={onCancel}
        className="min-h-11 rounded-md border border-border px-3 py-2 text-sm text-ink"
      >
        Annulla
      </button>
    </div>
  );
}
