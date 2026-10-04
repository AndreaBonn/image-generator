import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import {
  canRedoMaskHistory,
  canUndoMaskHistory,
  createEmptyMask,
  createMaskHistory,
  currentMask,
  invertMask,
  maskToOverlayRgba,
  paintStroke,
  pushMaskHistory,
  redoMaskHistory,
  undoMaskHistory,
  type MaskHistory,
  type MaskPoint,
} from "@/lib/mask";

const OVERLAY_COLOR = { r: 239, g: 68, b: 68 };
const OVERLAY_ALPHA = 0.45;
const MIN_BRUSH = 8;
const MAX_BRUSH = 160;
const DEFAULT_BRUSH = 40;

type Tool = "brush" | "eraser";
type Zoom = "fit" | "100";

interface MaskEditorProps {
  imageUrl: string;
  width: number;
  height: number;
  onMaskChange: (mask: Uint8Array) => void;
}

/**
 * Freehand mask editor on a native <canvas> over the source image
 * (SPEC.md § 11.2): brush, eraser, invert, clear, undo/redo (>= 20
 * steps), fit/100% zoom. Pointer Events cover mouse, touch and pen.
 */
export function MaskEditor({ imageUrl, width, height, onMaskChange }: MaskEditorProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const strokePoints = useRef<MaskPoint[]>([]);
  const isDrawing = useRef(false);
  const [history, setHistory] = useState<MaskHistory>(() =>
    createMaskHistory(createEmptyMask(width, height)),
  );
  const [tool, setTool] = useState<Tool>("brush");
  const [brushSize, setBrushSize] = useState(DEFAULT_BRUSH);
  const [zoom, setZoom] = useState<Zoom>("fit");

  const mask = currentMask(history);

  function redraw(next: Uint8Array) {
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    const rgba = maskToOverlayRgba(next, OVERLAY_COLOR, OVERLAY_ALPHA);
    ctx.putImageData(new ImageData(rgba, width, height), 0, 0);
  }

  useEffect(() => {
    const ctx = canvasRef.current?.getContext("2d");
    if (ctx) {
      const rgba = maskToOverlayRgba(mask, OVERLAY_COLOR, OVERLAY_ALPHA);
      ctx.putImageData(new ImageData(rgba, width, height), 0, 0);
    }
    onMaskChange(mask);
  }, [mask, width, height, onMaskChange]);

  function pointFromEvent(event: ReactPointerEvent<HTMLCanvasElement>): MaskPoint {
    const rect = event.currentTarget.getBoundingClientRect();
    const scaleX = width / rect.width;
    const scaleY = height / rect.height;
    return {
      x: (event.clientX - rect.left) * scaleX,
      y: (event.clientY - rect.top) * scaleY,
    };
  }

  function liveStroke(point: MaskPoint): Uint8Array {
    strokePoints.current.push(point);
    const value = tool === "brush" ? 255 : 0;
    const next = paintStroke(mask, width, height, strokePoints.current, brushSize / 2, value);
    redraw(next);
    return next;
  }

  function handlePointerDown(event: ReactPointerEvent<HTMLCanvasElement>) {
    event.currentTarget.setPointerCapture(event.pointerId);
    isDrawing.current = true;
    strokePoints.current = [];
    liveStroke(pointFromEvent(event));
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLCanvasElement>) {
    if (!isDrawing.current) return;
    liveStroke(pointFromEvent(event));
  }

  function commitStroke() {
    if (!isDrawing.current) return;
    isDrawing.current = false;
    const value = tool === "brush" ? 255 : 0;
    const next = paintStroke(mask, width, height, strokePoints.current, brushSize / 2, value);
    strokePoints.current = [];
    setHistory((h) => pushMaskHistory(h, next));
  }

  return (
    <div className="flex flex-col gap-3">
      <div
        className="relative overflow-auto rounded-md border border-border bg-paper-2"
        style={{ maxHeight: "60vh" }}
      >
        <div
          className="relative"
          style={{
            aspectRatio: `${width} / ${height}`,
            width: zoom === "fit" ? "100%" : `${width}px`,
          }}
        >
          <img
            src={imageUrl}
            alt="Immagine da modificare"
            className="absolute inset-0 h-full w-full object-fill"
          />
          <canvas
            ref={canvasRef}
            width={width}
            height={height}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={commitStroke}
            onPointerLeave={commitStroke}
            onPointerCancel={commitStroke}
            className="absolute inset-0 h-full w-full cursor-crosshair touch-none"
          />
        </div>
      </div>

      <MaskToolbar
        tool={tool}
        onToolChange={setTool}
        brushSize={brushSize}
        onBrushSizeChange={setBrushSize}
        zoom={zoom}
        onZoomChange={setZoom}
        canUndo={canUndoMaskHistory(history)}
        canRedo={canRedoMaskHistory(history)}
        onUndo={() => setHistory((h) => undoMaskHistory(h))}
        onRedo={() => setHistory((h) => redoMaskHistory(h))}
        onInvert={() => setHistory((h) => pushMaskHistory(h, invertMask(currentMask(h))))}
        onClear={() => setHistory((h) => pushMaskHistory(h, createEmptyMask(width, height)))}
      />
    </div>
  );
}

interface MaskToolbarProps {
  tool: Tool;
  onToolChange: (tool: Tool) => void;
  brushSize: number;
  onBrushSizeChange: (size: number) => void;
  zoom: Zoom;
  onZoomChange: (zoom: Zoom) => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onInvert: () => void;
  onClear: () => void;
}

function MaskToolbar(props: MaskToolbarProps) {
  const {
    tool,
    onToolChange,
    brushSize,
    onBrushSizeChange,
    zoom,
    onZoomChange,
    canUndo,
    canRedo,
    onUndo,
    onRedo,
    onInvert,
    onClear,
  } = props;

  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <button
        type="button"
        aria-pressed={tool === "brush"}
        onClick={() => onToolChange("brush")}
        className={toolButtonClass(tool === "brush")}
      >
        Pennello
      </button>
      <button
        type="button"
        aria-pressed={tool === "eraser"}
        onClick={() => onToolChange("eraser")}
        className={toolButtonClass(tool === "eraser")}
      >
        Gomma
      </button>

      <label className="flex min-h-11 items-center gap-2 text-ink-muted">
        Dimensione
        <input
          type="range"
          min={MIN_BRUSH}
          max={MAX_BRUSH}
          value={brushSize}
          onChange={(event) => onBrushSizeChange(Number(event.target.value))}
          aria-label="Dimensione del pennello"
          className="h-11 w-32"
        />
      </label>

      <button type="button" onClick={onInvert} className={toolButtonClass(false)}>
        Inverti
      </button>
      <button type="button" onClick={onClear} className={toolButtonClass(false)}>
        Cancella tutto
      </button>
      <button
        type="button"
        onClick={onUndo}
        disabled={!canUndo}
        className={`${toolButtonClass(false)} disabled:cursor-not-allowed disabled:opacity-50`}
      >
        Annulla
      </button>
      <button
        type="button"
        onClick={onRedo}
        disabled={!canRedo}
        className={`${toolButtonClass(false)} disabled:cursor-not-allowed disabled:opacity-50`}
      >
        Ripeti
      </button>

      <button
        type="button"
        aria-pressed={zoom === "fit"}
        onClick={() => onZoomChange("fit")}
        className={toolButtonClass(zoom === "fit")}
      >
        Adatta
      </button>
      <button
        type="button"
        aria-pressed={zoom === "100"}
        onClick={() => onZoomChange("100")}
        className={toolButtonClass(zoom === "100")}
      >
        100%
      </button>
    </div>
  );
}

function toolButtonClass(active: boolean): string {
  return `min-h-11 rounded-md border px-3 py-2 text-xs font-medium ${
    active ? "border-accent bg-paper-3 text-ink" : "border-border bg-paper-2 text-ink-muted hover:bg-paper-3"
  }`;
}
