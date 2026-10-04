import { ImageInput } from "@/components/edit/ImageInput";

interface ImageSourceInputProps {
  isUploading: boolean;
  uploadError: boolean;
  disabled?: boolean;
  inputLabel?: string;
  onFileSelected: (file: File) => void;
}

/** Drop/pick zone + upload error, shared by Modifica and Migliora (SPEC.md § 11.2). */
export function ImageSourceInput({
  isUploading,
  uploadError,
  disabled = false,
  inputLabel,
  onFileSelected,
}: ImageSourceInputProps) {
  return (
    <div className="flex flex-col gap-2">
      <ImageInput
        onFileSelected={onFileSelected}
        disabled={disabled || isUploading}
        inputLabel={inputLabel}
      />
      {uploadError ? (
        <p role="alert" className="text-sm text-danger">
          Impossibile caricare l&apos;immagine. Verifica formato e dimensione.
        </p>
      ) : null}
    </div>
  );
}
