import { useState } from "react";
import type { ReferenceItem } from "@/components/create/ReferencePicker";
import type { Task } from "@/api/types";

/** Only task whose first reference slot can be drawn instead of picked (SPEC.md
 * § 3.2): /tasks has no "can sketch" flag, so the id is matched directly. */
const SKETCH_TASK_ID = "da_schizzo";

/** Flags the CreatePage form derives from the selected task and the picked references. */
function deriveReferenceFlags(selectedTask: Task | undefined, count: number, sketchDirty: boolean) {
  const requiresReferences = (selectedTask?.max_references ?? 0) > 0;
  const minReferences = selectedTask?.min_references ?? 1;
  const canSketch = selectedTask?.id === SKETCH_TASK_ID && count === 0;
  return {
    requiresReferences,
    minReferences,
    missingReferences: requiresReferences && count < minReferences,
    canSketch,
    // Adding a reference would unmount the pad and drop a drawing not yet used as the sketch.
    sketchInProgress: canSketch && sketchDirty,
  };
}

/** State and derived flags for the reference/sketch picker on CreatePage. */
export function useReferences(selectedTask: Task | undefined) {
  const [references, setReferences] = useState<ReferenceItem[]>([]);
  const [referencesNotice, setReferencesNotice] = useState<string | null>(null);
  const [sketchDirty, setSketchDirty] = useState(false);

  /** Clears references and any pending notice, e.g. when the task selection changes. */
  function resetReferences() {
    setReferences([]);
    setReferencesNotice(null);
  }

  return {
    references,
    setReferences,
    referencesNotice,
    setReferencesNotice,
    sketchDirty,
    setSketchDirty,
    resetReferences,
    ...deriveReferenceFlags(selectedTask, references.length, sketchDirty),
  };
}
