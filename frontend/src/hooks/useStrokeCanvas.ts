import { useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import {
  canRedoMaskHistory,
  canUndoMaskHistory,
  createEmptyMask,
  createMaskHistory,
  currentMask,
  invertMask,
  paintStroke,
  pushMaskHistory,
  redoMaskHistory,
  undoMaskHistory,
  type MaskHistory,
  type MaskPoint,
  type MaskValue,
} from "@/lib/mask";

export interface UseStrokeCanvasOptions {
  width: number;
  height: number;
  /** Called with the in-progress mask on every pointerdown/move, before the stroke
   * is committed to history, so the caller can redraw immediately (no re-render
   * wait). Rendering itself (overlay color, plain ink, ...) is the caller's job. */
  onLivePaint?: (mask: Uint8Array) => void;
}

type CanvasPointerEvent = ReactPointerEvent<HTMLCanvasElement>;
type StrokeHandler = (event: CanvasPointerEvent, radius: number, value: MaskValue) => void;

/** Pointer position in mask pixels: the canvas may be displayed scaled. */
function pointFromEvent(event: CanvasPointerEvent, width: number, height: number): MaskPoint {
  const rect = event.currentTarget.getBoundingClientRect();
  return {
    x: (event.clientX - rect.left) * (width / rect.width),
    y: (event.clientY - rect.top) * (height / rect.height),
  };
}

/** Undo/redo history of masks, plus `push` for a committed stroke. */
function useMaskHistory(width: number, height: number) {
  const [history, setHistory] = useState<MaskHistory>(() =>
    createMaskHistory(createEmptyMask(width, height)),
  );
  return {
    mask: currentMask(history),
    canUndo: canUndoMaskHistory(history),
    canRedo: canRedoMaskHistory(history),
    undo: () => setHistory((h) => undoMaskHistory(h)),
    redo: () => setHistory((h) => redoMaskHistory(h)),
    invert: () => setHistory((h) => pushMaskHistory(h, invertMask(currentMask(h)))),
    clear: () => setHistory((h) => pushMaskHistory(h, createEmptyMask(width, height))),
    push: (next: Uint8Array) => setHistory((h) => pushMaskHistory(h, next)),
  };
}

/**
 * Shared pointer-to-stroke orchestration for brush-based canvases (MaskEditor,
 * SketchPad): an undo/redo history of `Uint8Array` masks, turning Pointer
 * Events into calls to the pure stroke math in lib/mask.ts. Radius and the
 * painted value (brush vs eraser) are passed in at call time because they
 * depend on the caller's own tool state, not on anything this hook owns.
 */
export function useStrokeCanvas({ width, height, onLivePaint }: UseStrokeCanvasOptions) {
  const strokePoints = useRef<MaskPoint[]>([]);
  const isDrawing = useRef(false);
  const { push, ...history } = useMaskHistory(width, height);
  const { mask } = history;

  const paint: StrokeHandler = (event, radius, value) => {
    strokePoints.current.push(pointFromEvent(event, width, height));
    onLivePaint?.(paintStroke(mask, width, height, strokePoints.current, radius, value));
  };
  const handlePointerDown: StrokeHandler = (event, radius, value) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    isDrawing.current = true;
    strokePoints.current = [];
    paint(event, radius, value);
  };
  const handlePointerMove: StrokeHandler = (event, radius, value) => {
    if (isDrawing.current) paint(event, radius, value);
  };
  function commitStroke(radius: number, value: MaskValue) {
    if (!isDrawing.current) return;
    isDrawing.current = false;
    const next = paintStroke(mask, width, height, strokePoints.current, radius, value);
    strokePoints.current = [];
    push(next);
  }

  return { ...history, handlePointerDown, handlePointerMove, commitStroke };
}
