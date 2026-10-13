import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { fetchGeneration, imageUrl, uploadFile } from "@/api/queries";

export interface SourceImage {
  url: string;
  width: number;
  height: number;
  uploadId: string | null;
}

export interface UseImageSourceResult {
  image: SourceImage | null;
  hasImage: boolean;
  isLoadingSource: boolean;
  isUploading: boolean;
  uploadError: boolean;
  selectFile: (file: File) => void;
}

/**
 * Shared source-image state for Modifica and Migliora (SPEC.md § 11.2): a
 * file dropped or picked locally, or a generation carried over via
 * `?source=<id>` from the Galleria. Extracted so a second page reuses the
 * upload + source-fetch wiring instead of duplicating EditPage's inline
 * logic (code-standards.md § Simplicità: estrazione di stato condiviso).
 */
export function useImageSource(sourceGenerationId: string | null): UseImageSourceResult {
  const [image, setImage] = useState<SourceImage | null>(null);
  const sourceQuery = useCarriedOverGeneration(sourceGenerationId, setImage);

  const uploadMutation = useMutation({
    mutationFn: (file: File) => uploadFile(file, "image"),
    onSuccess: (result, file) => {
      setImage({
        url: URL.createObjectURL(file),
        width: result.width,
        height: result.height,
        uploadId: result.upload_id,
      });
    },
  });

  return {
    image,
    hasImage: image !== null,
    isLoadingSource: sourceQuery.isLoading,
    isUploading: uploadMutation.isPending,
    uploadError: uploadMutation.isError,
    selectFile: (file: File) => uploadMutation.mutate(file),
  };
}

/** Loads the `?source=<id>` generation and hands it over as the source image once it arrives. */
function useCarriedOverGeneration(sourceGenerationId: string | null, onLoaded: (image: SourceImage) => void) {
  const sourceQuery = useQuery({
    queryKey: ["generation", sourceGenerationId],
    queryFn: ({ signal }) => fetchGeneration(sourceGenerationId as string, signal),
    enabled: sourceGenerationId !== null,
  });

  useEffect(() => {
    if (sourceQuery.data) {
      onLoaded({
        url: imageUrl(sourceQuery.data.id),
        width: sourceQuery.data.width,
        height: sourceQuery.data.height,
        uploadId: null,
      });
    }
  }, [sourceQuery.data, onLoaded]);
  return sourceQuery;
}
