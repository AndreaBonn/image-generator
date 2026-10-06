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
  const [history, setHistory] = useState<MaskHistory>(() =>
    createMaskHistory(createEmptyMask(width, height)),
  );
  const mask = currentMask(history);

  function pointFromEvent(event: ReactPointerEvent<HTMLCanvasElement>): MaskPoint {
    const rect = event.currentTarget.getBoundingClientRect();
    const scaleX = width / rect.width;
    const scaleY = height / rect.height;
    return {
      x: (event.clientX - rect.left) * scaleX,
      y: (event.clientY - rect.top) * scaleY,
    };
  }

  function paint(point: MaskPoint, radius: number, value: MaskValue): Uint8Array {
    strokePoints.current.push(point);
    const next = paintStroke(mask, width, height, strokePoints.current, radius, value);
    onLivePaint?.(next);
    return next;
  }

  function handlePointerDown(
    event: ReactPointerEvent<HTMLCanvasElement>,
    radius: number,
    value: MaskValue,
  ) {
    event.currentTarget.setPointerCapture(event.pointerId);
    isDrawing.current = true;
    strokePoints.current = [];
    paint(pointFromEvent(event), radius, value);
  }

  function handlePointerMove(
    event: ReactPointerEvent<HTMLCanvasElement>,
    radius: number,
    value: MaskValue,
  ) {
    if (!isDrawing.current) return;
    paint(pointFromEvent(event), radius, value);
  }

  function commitStroke(radius: number, value: MaskValue) {
    if (!isDrawing.current) return;
    isDrawing.current = false;
    const next = paintStroke(mask, width, height, strokePoints.current, radius, value);
    strokePoints.current = [];
    setHistory((h) => pushMaskHistory(h, next));
  }

  return {
    mask,
    canUndo: canUndoMaskHistory(history),
    canRedo: canRedoMaskHistory(history),
    undo: () => setHistory((h) => undoMaskHistory(h)),
    redo: () => setHistory((h) => redoMaskHistory(h)),
    invert: () => setHistory((h) => pushMaskHistory(h, invertMask(currentMask(h)))),
    clear: () => setHistory((h) => pushMaskHistory(h, createEmptyMask(width, height))),
    handlePointerDown,
    handlePointerMove,
    commitStroke,
  };
}
