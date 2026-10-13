import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { DiskInfo, ModelInfo } from "@/api/types";
import { modelStatusLabel } from "@/lib/modelStatus";
import { formatSizeGb } from "@/lib/format";
import { licenseLabel } from "@/lib/modelLicense";
import { InfoTip } from "@/components/ui/InfoTip";
import { HELP_TEXTS } from "@/lib/helpTexts";
import { useModelDownload, type UseModelDownloadResult } from "@/hooks/useModelDownload";
import { ModelDownloadButton } from "@/components/settings/ModelDownloadButton";
import { CopyableCommand } from "@/components/ui/CopyableCommand";

interface ModelsTableProps {
  models: ModelInfo[];
  installCommand: string;
  disk: DiskInfo;
}

/** Model inventory: download button (app-wide, T026-T031) plus the install
 * command as a secondary alternative, for missing-but-enabled models
 * (SPEC.md § 11.2). */
export function ModelsTable({ models, installCommand, disk }: ModelsTableProps) {
  const download = useModelDownload();
  const queryClient = useQueryClient();
  const completed = download.state.phase === "completed";

  // Refresh once per completion, here rather than per row: a download started from
  // another tab or from the CLI completes with no row attributed to it.
  useEffect(() => {
    if (!completed) return;
    queryClient.invalidateQueries({ queryKey: ["system"] });
    queryClient.invalidateQueries({ queryKey: ["tasks"] });
  }, [completed, queryClient]);

  return (
    <section className="flex flex-col gap-2 rounded-md border border-border bg-paper-2 p-3">
      <h2 className="flex items-center gap-1 text-sm font-semibold text-ink">
        Modelli
        <InfoTip text={HELP_TEXTS.modelsTable} label="Informazioni: Modelli" />
      </h2>
      {/* Tables may scroll on their own (WCAG 1.4.10 exempts 2-D content); the page must not. */}
      <div
        className="overflow-x-auto"
        role="region"
        aria-label="Tabella dei modelli"
      >
        <table className="w-full min-w-[32rem] text-left text-sm">
          <caption className="sr-only">
            Elenco dei modelli con stato, dimensione e licenza
          </caption>
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
              <ModelRow
                key={model.id}
                model={model}
                installCommand={installCommand}
                disk={disk}
                download={download}
              />
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function ModelRow({
  model,
  installCommand,
  disk,
  download,
}: {
  model: ModelInfo;
  installCommand: string;
  disk: DiskInfo;
  download: UseModelDownloadResult;
}) {
  const needsInstall = model.status === "missing" && model.enabled;

  return (
    <>
      <tr className="border-b border-border/50">
        <td className="py-1 pr-2 text-ink">{model.label}</td>
        <td className="py-1 pr-2 text-ink">{modelStatusLabel(model.status)}</td>
        <td className="py-1 pr-2 text-ink-muted">
          {model.size_gb !== null ? formatSizeGb(model.size_gb) : "-"}
        </td>
        <td className="py-1 pr-2 text-ink-muted">{licenseLabel(model.license)}</td>
      </tr>
      {needsInstall ? (
        <tr className="border-b border-border/50">
          <td colSpan={4} className="py-1">
            {model.manual_install ? (
              <p className="text-sm text-ink-muted">{model.manual_install}</p>
            ) : (
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                <ModelDownloadButton model={model} disk={disk} download={download} />
                <details className="text-sm text-ink-muted">
                  <summary className="min-h-11 cursor-pointer content-center">Da terminale</summary>
                  <CopyableCommand command={model.install_command ?? `${installCommand} ${model.id}`} />
                </details>
              </div>
            )}
          </td>
        </tr>
      ) : null}
    </>
  );
}
