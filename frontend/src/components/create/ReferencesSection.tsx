import { ReferencePicker, type ReferenceItem } from "@/components/create/ReferencePicker";
import { SketchPad } from "@/components/create/SketchPad";

interface ReferencesSectionProps {
  references: ReferenceItem[];
  onReferencesChange: (items: ReferenceItem[]) => void;
  minReferences: number;
  maxReferences: number;
  labels?: string[] | null;
  canSketch: boolean;
  sketchInProgress: boolean;
  referencesNotice: string | null;
  onSketchDirtyChange: (dirty: boolean) => void;
}

/** Reference picker plus the optional sketch pad for crea_da_riferimenti and
 * da_schizzo (SPEC.md § 3.1-3.2), shown only while the selected task takes
 * references. */
export function ReferencesSection({
  references,
  onReferencesChange,
  minReferences,
  maxReferences,
  labels,
  canSketch,
  sketchInProgress,
  referencesNotice,
  onSketchDirtyChange,
}: ReferencesSectionProps) {
  return (
    <div className="flex flex-col gap-1">
      <ReferencePicker
        items={references}
        onChange={onReferencesChange}
        minReferences={minReferences}
        maxReferences={maxReferences}
        labels={labels}
        disabled={sketchInProgress}
      />
      {canSketch ? (
        <div className="flex flex-col gap-1">
          <span className="text-sm font-semibold text-ink">Disegna lo schizzo</span>
          <SketchPad
            onReferenceCreated={(item) => onReferencesChange([...references, item])}
            onDirtyChange={onSketchDirtyChange}
          />
        </div>
      ) : null}
      {sketchInProgress ? (
        <p className="text-sm text-ink-muted">
          Usa lo schizzo o cancellalo prima di aggiungere altre immagini.
        </p>
      ) : null}
      {referencesNotice ? (
        <p role="status" className="text-sm text-ink-muted">
          {referencesNotice}
        </p>
      ) : null}
    </div>
  );
}
