import { useState } from "react";
import type { ModelInfo } from "@/api/types";
import { modelStatusLabel } from "@/lib/modelStatus";
import { formatSizeGb } from "@/lib/format";

interface ModelsTableProps {
  models: ModelInfo[];
  installCommand: string;
}

/** Model inventory with install command for missing-but-enabled models (SPEC.md § 11.2). */
export function ModelsTable({ models, installCommand }: ModelsTableProps) {
  return (
    <section className="flex flex-col gap-2 rounded-md border border-border bg-paper-2 p-3">
      <h2 className="text-sm font-semibold text-ink">Modelli</h2>
      <table className="w-full text-left text-sm">
        <caption className="sr-only">Elenco dei modelli con stato, dimensione e licenza</caption>
        <thead>
          <tr className="border-b border-border text-ink-muted">
            <th scope="col" className="py-1 pr-2 font-medium">
              Modello
            </th>
            <th scope="col" className="py-1 pr-2 font-medium">
              Stato
            </th>
            <th scope="col" className="py-1 pr-2 font-medium">
              Dimensione
            </th>
            <th scope="col" className="py-1 pr-2 font-medium">
              Licenza
            </th>
          </tr>
        </thead>
        <tbody>
          {models.map((model) => (
            <ModelRow key={model.id} model={model} installCommand={installCommand} />
          ))}
        </tbody>
      </table>
    </section>
  );
}

function ModelRow({ model, installCommand }: { model: ModelInfo; installCommand: string }) {
  const needsInstall = model.status === "missing" && model.enabled;

  return (
    <>
      <tr className="border-b border-border/50">
        <td className="py-1 pr-2 text-ink">{model.label}</td>
        <td className="py-1 pr-2 text-ink">{modelStatusLabel(model.status)}</td>
        <td className="py-1 pr-2 text-ink-muted">
          {model.size_gb !== null ? formatSizeGb(model.size_gb) : "-"}
        </td>
        <td className="py-1 pr-2 text-ink-muted">{model.license}</td>
      </tr>
      {needsInstall ? (
        <tr className="border-b border-border/50">
          <td colSpan={4} className="py-1">
            <InstallCommand command={`${installCommand} ${model.id}`} />
          </td>
        </tr>
      ) : null}
    </>
  );
}

function InstallCommand({ command }: { command: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(command);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <code className="rounded bg-paper-3 px-2 py-1 text-xs text-ink">{command}</code>
      <button
        type="button"
        onClick={handleCopy}
        className="min-h-11 rounded-md border border-border px-3 py-2 text-xs text-ink"
      >
        {copied ? "Copiato" : "Copia"}
      </button>
    </div>
  );
}
