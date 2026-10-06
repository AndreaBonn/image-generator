import { useEffect, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { uploadFile } from "@/api/queries";
import { useStrokeCanvas } from "@/hooks/useStrokeCanvas";
import { invertMask, isMaskEmpty, maskToRgba, type MaskValue } from "@/lib/mask";
import { exportMaskPng } from "@/lib/maskExport";
import type { ReferenceItem } from "@/components/create/ReferencePicker";

const SKETCH_SIZE = 1024;
const DEFAULT_BRUSH_SIZE = 16;
const BRUSH_SIZES: { value: number; label: string }[] = [
  { value: 6, label: "Fine" },
  { value: 16, label: "Medio" },
  { value: 32, label: "Spesso" },
];

type Tool = "brush" | "eraser";

interface SketchPadProps {
  /** Called once the exported sketch has uploaded; the parent appends it to its
   * own reference list, same shape ReferencePicker's own upload hands back. */
  onReferenceCreated: (item: ReferenceItem) => void;
  /** Told whether the canvas holds a drawing not yet used as a sketch, so the
   * parent can avoid unmounting the pad (and losing the drawing) meanwhile. */
  onDirtyChange?: (dirty: boolean) => void;
  disabled?: boolean;
}

/**
 * Freehand sketch input for da_schizzo (SPEC.md § 3.2): a white 1024x1024
 * canvas, black ink in 3 fixed brush sizes plus an eraser, undo and clear.
 * Shares the pointer-to-stroke orchestration with MaskEditor via
 * useStrokeCanvas; only the rendering (black ink on white, not a translucent
 * overlay) and the export target (an uploaded reference image, not a mask)
 * differ.
 */
export function SketchPad({ onReferenceCreated, onDirtyChange, disabled = false }: SketchPadProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [tool, setTool] = useState<Tool>("brush");
  const [brushSize, setBrushSize] = useState(DEFAULT_BRUSH_SIZE);

  function redraw(next: Uint8Array) {
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    const rgba = maskToRgba(invertMask(next));
    ctx.putImageData(new ImageData(rgba, SKETCH_SIZE, SKETCH_SIZE), 0, 0);
  }

  const stroke = useStrokeCanvas({ width: SKETCH_SIZE, height: SKETCH_SIZE, onLivePaint: redraw });
  const { mask } = stroke;

  useEffect(() => {
    redraw(mask);
  }, [mask]);

  const value: MaskValue = tool === "brush" ? 255 : 0;
  const radius = brushSize / 2;
  const empty = isMaskEmpty(mask);

  useEffect(() => {
    onDirtyChange?.(!empty);
  }, [empty, onDirtyChange]);

  const uploadMutation = useMutation({
    mutationFn: async () => {
      const blob = await exportMaskPng(invertMask(mask), SKETCH_SIZE, SKETCH_SIZE);
      const file = new File([blob], "schizzo.png", { type: "image/png" });
      const result = await uploadFile(file, "image");
      return { result, blob };
    },
    onSuccess: ({ result, blob }) => {
      onReferenceCreated({
        key: `upload:${result.upload_id}`,
        input: { upload_id: result.upload_id },
        previewUrl: URL.createObjectURL(blob),
      });
      stroke.clear();
    },
  });

  function handlePointerDown(event: Parameters<typeof stroke.handlePointerDown>[0]) {
    if (disabled) return;
    stroke.handlePointerDown(event, radius, value);
  }

  function handlePointerMove(event: Parameters<typeof stroke.handlePointerMove>[0]) {
    if (disabled) return;
    stroke.handlePointerMove(event, radius, value);
  }

  function commitStroke() {
    if (disabled) return;
    stroke.commitStroke(radius, value);
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="relative mx-auto aspect-square w-full max-w-[32rem] overflow-hidden rounded-md border border-border bg-white">
        <canvas
          ref={canvasRef}
          width={SKETCH_SIZE}
          height={SKETCH_SIZE}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={commitStroke}
          onPointerLeave={commitStroke}
          onPointerCancel={commitStroke}
          role="img"
          aria-label="Tela per disegnare lo schizzo"
          className="absolute inset-0 h-full w-full cursor-crosshair touch-none"
        />
      </div>

      <div className="flex flex-wrap items-center gap-2 text-sm">
        <button
          type="button"
          aria-pressed={tool === "brush"}
          onClick={() => setTool("brush")}
          disabled={disabled}
          className={toolButtonClass(tool === "brush")}
        >
          Pennello
        </button>
        <button
          type="button"
          aria-pressed={tool === "eraser"}
          onClick={() => setTool("eraser")}
          disabled={disabled}
          className={toolButtonClass(tool === "eraser")}
        >
          Gomma
        </button>

        <span className="flex items-center gap-1" role="group" aria-label="Spessore del pennello">
          {BRUSH_SIZES.map((size) => (
            <button
              key={size.value}
              type="button"
              aria-pressed={brushSize === size.value}
              onClick={() => setBrushSize(size.value)}
              disabled={disabled}
              className={toolButtonClass(brushSize === size.value)}
            >
              {size.label}
            </button>
          ))}
        </span>

        <button
          type="button"
          onClick={stroke.undo}
          disabled={disabled || !stroke.canUndo}
          className={`${toolButtonClass(false)} disabled:cursor-not-allowed disabled:opacity-50`}
        >
          Annulla
        </button>
        <button
          type="button"
          onClick={stroke.clear}
          disabled={disabled || empty}
          className={`${toolButtonClass(false)} disabled:cursor-not-allowed disabled:opacity-50`}
        >
          Cancella tutto
        </button>
      </div>

      <button
        type="button"
        onClick={() => uploadMutation.mutate()}
        disabled={disabled || empty || uploadMutation.isPending}
        className="min-h-11 w-fit rounded-md bg-accent px-4 py-2 text-sm font-semibold text-accent-ink disabled:cursor-not-allowed disabled:bg-paper-3 disabled:text-ink-muted"
      >
        {uploadMutation.isPending ? "Caricamento..." : "Usa come schizzo"}
      </button>

      {uploadMutation.isError ? (
        <p role="alert" className="text-sm text-danger">
          Impossibile caricare lo schizzo. Verifica la connessione e riprova.
        </p>
      ) : null}
    </div>
  );
}

function toolButtonClass(active: boolean): string {
  return `min-h-11 rounded-md border px-3 py-2 text-xs font-medium ${
    active ? "border-accent bg-paper-3 text-ink" : "border-border bg-paper-2 text-ink-muted hover:bg-paper-3"
  }`;
}
