import { useRef } from "react";
import type { DiskInfo, ModelInfo } from "@/api/types";
import { useModalFocus } from "@/hooks/useModalFocus";
import { formatSizeGb } from "@/lib/format";

interface ModelInstallConfirmDialogProps {
  model: ModelInfo;
  disk: DiskInfo;
  onConfirm: () => void;
  onCancel: () => void;
}

/** Confirms a model download before it starts: size and the space that will
 * remain (SPEC.md § 11.2). Same focus-trap pattern as EmptyTrashDialog. */
export function ModelInstallConfirmDialog({ model, disk, onConfirm, onCancel }: ModelInstallConfirmDialogProps) {
  const dialogRef = useRef<HTMLDivElement | null>(null);
  useModalFocus(dialogRef, onCancel);
  const titleId = `install-model-title-${model.id}`;
  const remainingGb = model.size_gb !== null ? disk.free_gb - model.size_gb : null;

  return (
    <div className="fixed inset-0 z-modal flex items-center justify-center p-4">
      <button
        type="button"
        onClick={onCancel}
        aria-label="Annulla"
        className="absolute inset-0 bg-black/60"
      />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="relative flex w-full max-w-sm flex-col gap-3 rounded-md border border-border bg-paper p-4"
      >
        <h2 id={titleId} className="text-base font-semibold text-ink">
          Scaricare {model.label}?
        </h2>
        <p className="text-sm text-ink-muted">
          {model.size_gb !== null ? (
            <>
              Verranno scaricati {formatSizeGb(model.size_gb)}. Dopo il download resteranno liberi{" "}
              {formatSizeGb(remainingGb as number)}.
            </>
          ) : (
            "La dimensione del download non è nota in anticipo."
          )}
        </p>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="min-h-11 rounded-md border border-border px-3 py-2 text-sm text-ink"
          >
            Annulla
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="min-h-11 rounded-md border border-accent bg-paper-2 px-3 py-2 text-sm font-semibold text-accent-text"
          >
            Scarica
          </button>
        </div>
      </div>
    </div>
  );
}
