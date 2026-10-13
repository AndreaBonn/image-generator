import { useId, useState, type ReactNode } from "react";
import type { FeatureGroup } from "@/lib/modelFeatures";
import { formatSizeGb } from "@/lib/format";

interface ModelsByFeatureProps {
  groups: FeatureGroup[];
  modelCount: number;
  /** Something enabled is missing: the technical list opens so its install buttons show. */
  hasMissingModels: boolean;
  /** The technical table with install buttons (ModelsTable). */
  children: ReactNode;
}

/** What the installed models make possible (I2); the file-by-file table sits in a fold below. */
export function ModelsByFeature({ groups, modelCount, hasMissingModels, children }: ModelsByFeatureProps) {
  const titleId = useId();
  const [technicalOpen, setTechnicalOpen] = useState(hasMissingModels);

  return (
    <section aria-labelledby={titleId} className="flex flex-col gap-2 rounded-md border border-border bg-paper-2 p-3">
      <h2 id={titleId} className="text-sm font-semibold text-ink">
        Cosa puoi fare con i modelli installati
      </h2>
      <ul className="flex flex-col divide-y divide-border">
        {groups.map((group) => (
          <li key={group.family} className="flex flex-wrap items-center justify-between gap-2 py-2">
            <span className="flex flex-col">
              <span className="text-sm text-ink">{group.taskLabels.join(", ")}</span>
              <span className="text-xs text-ink-muted">
                {formatSizeGb(group.sizeGb)} · {group.licenses.join(" · ")}
              </span>
            </span>
            <span className={`text-sm font-semibold ${group.ready ? "text-success" : "text-warning"}`}>
              <span aria-hidden="true">{group.ready ? "✓ " : "! "}</span>
              {group.ready ? "Pronto" : "Manca un modello"}
            </span>
          </li>
        ))}
      </ul>
      <details open={technicalOpen} onToggle={(event) => setTechnicalOpen(event.currentTarget.open)}>
        <summary className="min-h-11 cursor-pointer content-center text-sm text-ink-muted">
          Tutti i file dei modelli ({modelCount}), con i nomi tecnici
        </summary>
        {children}
      </details>
    </section>
  );
}
