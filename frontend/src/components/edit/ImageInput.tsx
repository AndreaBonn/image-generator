import { useRef, type DragEvent } from "react";

const ACCEPTED_TYPES = ["image/png", "image/jpeg", "image/webp"];

interface ImageInputProps {
  onFileSelected: (file: File) => void;
  disabled?: boolean;
  inputLabel?: string;
}

/** Drag-and-drop zone or file picker for the source image (SPEC.md § 11.2, PNG/JPEG/WebP). */
export function ImageInput({
  onFileSelected,
  disabled = false,
  inputLabel = "Scegli un'immagine da modificare",
}: ImageInputProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);

  function handleFiles(files: FileList | null) {
    const file = files?.[0];
    if (file && ACCEPTED_TYPES.includes(file.type)) {
      onFileSelected(file);
    }
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    if (!disabled) handleFiles(event.dataTransfer.files);
  }

  return (
    <div
      onDragOver={(event) => event.preventDefault()}
      onDrop={handleDrop}
      className="flex flex-col items-center gap-2 rounded-md border border-dashed border-border bg-paper-2 p-6 text-center"
    >
      <p className="text-sm text-ink-muted">Trascina un&apos;immagine qui, oppure</p>
      <button
        type="button"
        disabled={disabled}
        onClick={() => inputRef.current?.click()}
        className="min-h-11 rounded-md border border-border bg-paper-3 px-3 py-2 text-sm font-medium text-ink disabled:cursor-not-allowed disabled:cursor-not-allowed disabled:bg-paper-3 disabled:text-ink-muted"
      >
        Scegli un file
      </button>
      <p className="text-xs text-ink-muted">PNG, JPEG o WebP, massimo 20 MB e 4096 px per lato.</p>
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED_TYPES.join(",")}
        disabled={disabled}
        onChange={(event) => handleFiles(event.target.files)}
        className="sr-only"
        aria-label={inputLabel}
      />
    </div>
  );
}
