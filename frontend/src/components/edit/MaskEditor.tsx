import { useEffect, useMemo, useRef, useState } from "react";
import { maskToOverlayRgba, type MaskValue } from "@/lib/mask";
import { useStrokeCanvas } from "@/hooks/useStrokeCanvas";
import { InfoTip } from "@/components/ui/InfoTip";
import { HELP_TEXTS } from "@/lib/helpTexts";

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
  const [tool, setTool] = useState<Tool>("brush");
  const [brushSize, setBrushSize] = useState(DEFAULT_BRUSH);
  const [zoom, setZoom] = useState<Zoom>("fit");

  function redraw(next: Uint8Array) {
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    const rgba = maskToOverlayRgba(next, OVERLAY_COLOR, OVERLAY_ALPHA);
    ctx.putImageData(new ImageData(rgba, width, height), 0, 0);
  }

  const stroke = useStrokeCanvas({ width, height, onLivePaint: redraw });
  const { mask } = stroke;
  const isMaskEmpty = useMemo(() => !mask.some((value) => value > 0), [mask]);

  useEffect(() => {
    const ctx = canvasRef.current?.getContext("2d");
    if (ctx) {
      const rgba = maskToOverlayRgba(mask, OVERLAY_COLOR, OVERLAY_ALPHA);
      ctx.putImageData(new ImageData(rgba, width, height), 0, 0);
    }
    onMaskChange(mask);
  }, [mask, width, height, onMaskChange]);

  const value: MaskValue = tool === "brush" ? 255 : 0;
  const radius = brushSize / 2;

  function handlePointerDown(event: Parameters<typeof stroke.handlePointerDown>[0]) {
    stroke.handlePointerDown(event, radius, value);
  }

  function handlePointerMove(event: Parameters<typeof stroke.handlePointerMove>[0]) {
    stroke.handlePointerMove(event, radius, value);
  }

  function commitStroke() {
    stroke.commitStroke(radius, value);
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
          {isMaskEmpty ? (
            <p className="pointer-events-none absolute left-1/2 top-3 -translate-x-1/2 rounded-md border border-border bg-paper/90 px-3 py-1.5 text-center text-sm text-ink shadow">
              Colora con il pennello la zona da cambiare
            </p>
          ) : null}
        </div>
      </div>

      <MaskToolbar
        tool={tool}
        onToolChange={setTool}
        brushSize={brushSize}
        onBrushSizeChange={setBrushSize}
        zoom={zoom}
        onZoomChange={setZoom}
        canUndo={stroke.canUndo}
        canRedo={stroke.canRedo}
        onUndo={stroke.undo}
        onRedo={stroke.redo}
        onInvert={stroke.invert}
        onClear={stroke.clear}
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
      <InfoTip text={HELP_TEXTS.maskTools} label="Informazioni: pennello e gomma" />

      <span className="flex min-h-11 items-center gap-2 text-ink-muted">
        <label htmlFor="mask-brush-size">Dimensione</label>
        <input
          id="mask-brush-size"
          type="range"
          min={MIN_BRUSH}
          max={MAX_BRUSH}
          value={brushSize}
          onChange={(event) => onBrushSizeChange(Number(event.target.value))}
          aria-label="Dimensione del pennello"
          className="h-11 w-32"
        />
        <InfoTip text={HELP_TEXTS.maskBrushSize} label="Informazioni: dimensione del pennello" />
      </span>

      <button type="button" onClick={onInvert} className={toolButtonClass(false)}>
        Inverti
      </button>
      <InfoTip text={HELP_TEXTS.maskInvert} label="Informazioni: Inverti" />
      <button type="button" onClick={onClear} className={toolButtonClass(false)}>
        Cancella tutto
      </button>
      <InfoTip text={HELP_TEXTS.maskClear} label="Informazioni: Cancella tutto" />
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
      <InfoTip text={HELP_TEXTS.maskZoom} label="Informazioni: zoom" />
    </div>
  );
}

function toolButtonClass(active: boolean): string {
  return `min-h-11 rounded-md border px-3 py-2 text-xs font-medium ${
    active ? "border-accent bg-paper-3 text-ink" : "border-border bg-paper-2 text-ink-muted hover:bg-paper-3"
  }`;
}
