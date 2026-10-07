import { useState } from "react";
import type { ReferenceItem } from "@/components/create/ReferencePicker";
import type { Task } from "@/api/types";

/** Only task whose first reference slot can be drawn instead of picked (SPEC.md
 * § 3.2): /tasks has no "can sketch" flag, so the id is matched directly. */
const SKETCH_TASK_ID = "da_schizzo";

/** State and derived flags for the reference/sketch picker on CreatePage. */
export function useReferences(selectedTask: Task | undefined) {
  const [references, setReferences] = useState<ReferenceItem[]>([]);
  const [referencesNotice, setReferencesNotice] = useState<string | null>(null);
  const [sketchDirty, setSketchDirty] = useState(false);

  const requiresReferences = (selectedTask?.max_references ?? 0) > 0;
  const minReferences = selectedTask?.min_references ?? 1;
  const missingReferences = requiresReferences && references.length < minReferences;
  const canSketch = selectedTask?.id === SKETCH_TASK_ID && references.length === 0;
  // Adding a reference would unmount the pad and drop a drawing not yet used as the sketch.
  const sketchInProgress = canSketch && sketchDirty;

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
    requiresReferences,
    minReferences,
    missingReferences,
    canSketch,
    sketchInProgress,
    resetReferences,
  };
}
