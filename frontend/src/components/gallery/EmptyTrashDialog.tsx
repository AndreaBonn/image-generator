import { useRef } from "react";
import { useModalFocus } from "@/hooks/useModalFocus";
import { formatBytes } from "@/lib/format";

interface EmptyTrashDialogProps {
  count: number;
  bytes: number;
  isPending: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/** Confirmation for "Svuota il cestino" (A4): states what is lost, cannot be undone. */
export function EmptyTrashDialog({ count, bytes, isPending, onConfirm, onCancel }: EmptyTrashDialogProps) {
  const dialogRef = useRef<HTMLDivElement | null>(null);
  useModalFocus(dialogRef, onCancel);

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
        aria-labelledby="empty-trash-title"
        tabIndex={-1}
        className="relative flex w-full max-w-sm flex-col gap-3 rounded-md border border-border bg-paper p-4"
      >
        <h2 id="empty-trash-title" className="text-base font-semibold text-ink">
          Svuotare il cestino?
        </h2>
        <p className="text-sm text-ink-muted">
          Verranno eliminate per sempre {count} {count === 1 ? "immagine" : "immagini"}, liberando{" "}
          {formatBytes(bytes)}. L&apos;operazione non si può annullare.
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
            disabled={isPending}
            className="min-h-11 rounded-md border border-danger bg-paper-2 px-3 py-2 text-sm font-semibold text-danger disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isPending ? "Eliminazione..." : "Svuota il cestino"}
          </button>
        </div>
      </div>
    </div>
  );
}
