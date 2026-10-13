import { useRef, useState, type DragEvent, type ReactNode } from "react";
import { useMutation } from "@tanstack/react-query";
import { fetchStyles, uploadFile } from "@/api/queries";
import { ApiError } from "@/api/errors";
import { resolveRecipeImport, type RecipeImportPatch } from "@/lib/recipeImport";
import type { Task } from "@/api/types";

const ACCEPTED_TYPES = ["image/png", "image/jpeg", "image/webp"];

interface RecipeImportProps {
  /** Catalog used to validate the recipe's task_id/aspect_ratio/limits (A5). */
  tasks: Task[];
  onApply: (patch: RecipeImportPatch) => void;
  /** The prompt area: wrapped so a drag-and-drop there also imports a recipe. */
  children: ReactNode;
}

/**
 * "Importa da immagine" (A5): uploads a PNG created by this app and, if it
 * carries an embedded recipe, fills the form with the valid subset of its
 * settings. Never submits the job on its own.
 */
export function RecipeImport({ tasks, onApply, children }: RecipeImportProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [message, setMessage] = useState<{ kind: "info" | "error"; text: string } | null>(null);

  const importMutation = useMutation({
    mutationFn: (file: File) => uploadFile(file, "image"),
    onSuccess: async (result) => {
      if (!result.recipe) {
        setMessage({ kind: "info", text: "Questa immagine non contiene impostazioni di Image Generator." });
        return;
      }
      const styles = await fetchStyles("").catch(() => []);
      const { patch, skipped } = resolveRecipeImport(result.recipe, tasks, styles);
      onApply(patch);
      setMessage({
        kind: "info",
        text:
          skipped.length === 0
            ? "Impostazioni importate dall'immagine."
            : `Impostazioni importate dall'immagine. Non applicate perché non valide per questo compito: ${skipped.join(", ")}.`,
      });
    },
    onError: (error: unknown) => {
      setMessage({
        kind: "error",
        text: error instanceof ApiError ? error.message : "Impossibile leggere l'immagine.",
      });
    },
  });

  function handleFiles(files: FileList | null) {
    const file = files?.[0];
    if (file && ACCEPTED_TYPES.includes(file.type)) {
      setMessage(null);
      importMutation.mutate(file);
    }
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setIsDragging(false);
    handleFiles(event.dataTransfer.files);
  }

  return (
    <div
      onDragOver={(event) => {
        event.preventDefault();
        setIsDragging(true);
      }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={handleDrop}
      className={`flex flex-col gap-2 rounded-md ${isDragging ? "ring-2 ring-accent" : ""}`}
    >
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED_TYPES.join(",")}
        onChange={(event) => handleFiles(event.target.files)}
        className="sr-only"
        aria-label="Importa da immagine"
      />

      {children}

      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={importMutation.isPending}
        className="min-h-11 w-fit text-left text-sm text-accent-text underline disabled:cursor-not-allowed disabled:opacity-60"
      >
        {importMutation.isPending ? "Importazione..." : "Riprendi le impostazioni da un'immagine creata qui"}
      </button>

      {message ? (
        <p role={message.kind === "error" ? "alert" : "status"} className={message.kind === "error" ? "text-sm text-danger" : "text-sm text-ink-muted"}>
          {message.text}
        </p>
      ) : null}
    </div>
  );
}
