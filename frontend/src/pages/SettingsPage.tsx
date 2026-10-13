import { useQuery } from "@tanstack/react-query";
import { fetchSystem, fetchTasks, fetchTrashSummary } from "@/api/queries";
import { SystemSummary } from "@/components/settings/SystemSummary";
import { readinessChecks } from "@/lib/readiness";
import { featureGroups } from "@/lib/modelFeatures";
import { ModelsByFeature } from "@/components/settings/ModelsByFeature";
import { EngineStatusCard } from "@/components/settings/EngineStatusCard";
import { GpuCard } from "@/components/settings/GpuCard";
import { DiskCard } from "@/components/settings/DiskCard";
import { LoadedModelCard } from "@/components/settings/LoadedModelCard";
import { ModelsTable } from "@/components/settings/ModelsTable";
import { ExamplesCard } from "@/components/settings/ExamplesCard";
import { ClearOutputCard } from "@/components/settings/ClearOutputCard";
import { ThemeCard } from "@/components/settings/ThemeCard";
import { PageTitle } from "@/components/layout/PageTitle";

const POLL_INTERVAL_MS = 10_000;

/** Impostazioni: engine, GPU, disk, loaded model, model inventory, theme (SPEC.md § 11.2). */
export function SettingsPage() {
  const systemQuery = useQuery({
    queryKey: ["system"],
    queryFn: ({ signal }) => fetchSystem(signal),
    refetchInterval: POLL_INTERVAL_MS,
  });
  // A4: nice-to-have trash size shown next to Disco; never blocks the page on failure.
  const trashSummaryQuery = useQuery({
    queryKey: ["trash-summary"],
    queryFn: ({ signal }) => fetchTrashSummary(signal),
  });

  const tasksQuery = useQuery({ queryKey: ["tasks"], queryFn: ({ signal }) => fetchTasks(signal) });

  if (systemQuery.isLoading) {
    return (
      <div className="flex flex-col gap-2">
        <PageTitle>Impostazioni</PageTitle>
        <p className="text-ink-muted">Caricamento stato del motore...</p>
      </div>
    );
  }

  if (systemQuery.isError || !systemQuery.data) {
    return (
      <div className="flex flex-col gap-2">
        <PageTitle>Impostazioni</PageTitle>
        <p className="text-danger">Impossibile leggere lo stato del motore.</p>
        <button
          type="button"
          onClick={() => systemQuery.refetch()}
          className="min-h-11 w-fit rounded-md border border-border px-3 py-2 text-sm text-ink"
        >
          Riprova
        </button>
      </div>
    );
  }

  const system = systemQuery.data;

  return (
    <div className="flex flex-col gap-4">
      <PageTitle>Impostazioni</PageTitle>

      {tasksQuery.data ? <SystemSummary checks={readinessChecks(system, tasksQuery.data)} /> : null}
      <EngineStatusCard engine={system.engine} />
      {system.gpu ? <GpuCard gpu={system.gpu} /> : null}
      <DiskCard disk={system.disk} trashSummary={trashSummaryQuery.data} />
      <LoadedModelCard family={system.loaded_family} />
      <ModelsByFeature
        groups={featureGroups(system.models, tasksQuery.data ?? [])}
        modelCount={system.models.length}
        hasMissingModels={system.models.some((model) => model.enabled && model.status === "missing")}
      >
        <ModelsTable models={system.models} installCommand={system.install_command} disk={system.disk} />
      </ModelsByFeature>
      <ExamplesCard />
      <ClearOutputCard />
      <ThemeCard />
    </div>
  );
}
