import { useEffect, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { thumbnailUrl, uploadFile } from "@/api/queries";
import { InfoTip } from "@/components/ui/InfoTip";
import { HELP_TEXTS } from "@/lib/helpTexts";
import { MAX_REFERENCES, type ReferenceInput } from "@/api/types";
import { GalleryReferenceDialog } from "@/components/create/GalleryReferenceDialog";

const ACCEPTED_TYPES = ["image/png", "image/jpeg", "image/webp"];

/** One picked reference image, with a local preview independent of its API shape. */
export interface ReferenceItem {
  key: string;
  input: ReferenceInput;
  previewUrl: string;
}

interface ReferencePickerProps {
  items: ReferenceItem[];
  onChange: (items: ReferenceItem[]) => void;
  disabled?: boolean;
}

/**
 * Picker for crea_da_riferimenti (SPEC.md § 3.1, § 7.3): 1-3 reference images,
 * added from a local file or from an existing generation. Controlled by the
 * parent so a recipe import (lib/recipeImport.ts) can clear it from outside.
 */
/** Revokes local blob previews once their item leaves the list or the picker unmounts. */
function usePreviewRevocation(items: ReferenceItem[]) {
  const previous = useRef<ReferenceItem[]>(items);
  useEffect(() => {
    const kept = new Set(items.map((item) => item.previewUrl));
    for (const item of previous.current) {
      if (item.previewUrl.startsWith("blob:") && !kept.has(item.previewUrl)) {
        URL.revokeObjectURL(item.previewUrl);
      }
    }
    previous.current = items;
  }, [items]);
  useEffect(
    () => () => {
      for (const item of previous.current) {
        if (item.previewUrl.startsWith("blob:")) URL.revokeObjectURL(item.previewUrl);
      }
    },
    [],
  );
}

export function ReferencePicker({ items, onChange, disabled = false }: ReferencePickerProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [galleryOpen, setGalleryOpen] = useState(false);
  const atMax = items.length >= MAX_REFERENCES;
  usePreviewRevocation(items);

  const uploadMutation = useMutation({
    mutationFn: (file: File) => uploadFile(file, "image"),
    onSuccess: (result, file) => {
      onChange([
        ...items,
        {
          key: `upload:${result.upload_id}`,
          input: { upload_id: result.upload_id },
          previewUrl: URL.createObjectURL(file),
        },
      ]);
    },
  });

  function handleFiles(files: FileList | null) {
    const file = files?.[0];
    if (!file || disabled || atMax) return;
    if (!ACCEPTED_TYPES.includes(file.type)) return;
    uploadMutation.mutate(file);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function handleRemove(key: string) {
    onChange(items.filter((item) => item.key !== key));
  }

  function handlePickFromGallery(generationId: string) {
    onChange([
      ...items,
      {
        key: `generation:${generationId}`,
        input: { generation_id: generationId },
        previewUrl: thumbnailUrl(generationId),
      },
    ]);
    setGalleryOpen(false);
  }

  return (
    <div className="flex flex-col gap-2">
      <span className="flex items-center gap-1 text-sm font-semibold text-ink">
        Immagini di riferimento
        <InfoTip text={HELP_TEXTS.references} label="Informazioni: Immagini di riferimento" />
      </span>

      {items.length === 0 ? (
        <p className="text-sm text-ink-muted">Aggiungi da 1 a 3 foto dello stesso soggetto.</p>
      ) : (
        <ul className="flex flex-wrap gap-2">
          {items.map((item, index) => (
            <li
              key={item.key}
              className="relative h-24 w-24 overflow-hidden rounded-md border border-border"
            >
              <img src={item.previewUrl} alt="" className="h-full w-full object-cover" />
              <button
                type="button"
                onClick={() => handleRemove(item.key)}
                disabled={disabled}
                aria-label={`Rimuovi riferimento ${index + 1}`}
                className="absolute right-0 top-0 flex h-11 w-11 items-start justify-end p-1 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {/* 44px hit target for touch, 24px visual badge so the thumbnail stays visible. */}
                <span
                  aria-hidden="true"
                  className="flex h-6 w-6 items-center justify-center rounded-full bg-paper/90 text-xs font-semibold text-ink"
                >
                  ×
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <p aria-live="polite" className="text-sm text-ink-muted">
        {items.length} di {MAX_REFERENCES}
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={disabled || atMax || uploadMutation.isPending}
          className="min-h-11 rounded-md border border-border bg-paper-2 px-3 py-2 text-sm font-medium text-ink disabled:cursor-not-allowed disabled:opacity-60"
        >
          {uploadMutation.isPending ? "Caricamento..." : "Aggiungi da file"}
        </button>
        <button
          type="button"
          onClick={() => setGalleryOpen(true)}
          disabled={disabled || atMax || uploadMutation.isPending}
          className="min-h-11 rounded-md border border-border bg-paper-2 px-3 py-2 text-sm font-medium text-ink disabled:cursor-not-allowed disabled:opacity-60"
        >
          Aggiungi dalla galleria
        </button>
      </div>
      <input
        ref={fileInputRef}
        type="file"
        accept={ACCEPTED_TYPES.join(",")}
        onChange={(event) => handleFiles(event.target.files)}
        className="sr-only"
        aria-label="Aggiungi riferimento da file"
      />

      {uploadMutation.isError ? (
        <p role="alert" className="text-sm text-danger">
          Impossibile caricare l&apos;immagine. Verifica formato e dimensione.
        </p>
      ) : null}

      {galleryOpen ? (
        <GalleryReferenceDialog
          excludeIds={items
            .map((item) => ("generation_id" in item.input ? item.input.generation_id : null))
            .filter((id): id is string => id !== null)}
          onPick={handlePickFromGallery}
          onClose={() => setGalleryOpen(false)}
        />
      ) : null}
    </div>
  );
}
