import { useQuery } from "@tanstack/react-query";
import { fetchSystem, fetchTrashSummary } from "@/api/queries";
import { EngineStatusCard } from "@/components/settings/EngineStatusCard";
import { GpuCard } from "@/components/settings/GpuCard";
import { DiskCard } from "@/components/settings/DiskCard";
import { LoadedModelCard } from "@/components/settings/LoadedModelCard";
import { ModelsTable } from "@/components/settings/ModelsTable";
import { ClearOutputCard } from "@/components/settings/ClearOutputCard";
import { ThemeCard } from "@/components/settings/ThemeCard";

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

  if (systemQuery.isLoading) {
    return (
      <div className="flex flex-col gap-2">
        <h1 className="text-xl font-semibold text-ink">Impostazioni</h1>
        <p className="text-ink-muted">Caricamento stato del motore...</p>
      </div>
    );
  }

  if (systemQuery.isError || !systemQuery.data) {
    return (
      <div className="flex flex-col gap-2">
        <h1 className="text-xl font-semibold text-ink">Impostazioni</h1>
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
      <h1 className="text-xl font-semibold text-ink">Impostazioni</h1>

      <EngineStatusCard engine={system.engine} />
      {system.gpu ? <GpuCard gpu={system.gpu} /> : null}
      <DiskCard disk={system.disk} trashSummary={trashSummaryQuery.data} />
      <LoadedModelCard family={system.loaded_family} />
      <ModelsTable models={system.models} installCommand={system.install_command} />
      <ClearOutputCard />
      <ThemeCard />
    </div>
  );
}
