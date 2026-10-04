import { useQuery } from "@tanstack/react-query";
import { fetchSystem } from "@/api/queries";
import { shouldWarnAboutGpu } from "@/lib/gpuWarning";
import { GpuWarningMessage } from "@/components/layout/GpuWarningMessage";

const POLL_INTERVAL_MS = 10_000;

/**
 * Non-blocking GPU-contention warning shown above "Genera" on Crea,
 * Modifica and Migliora (SPEC.md § 5.3). Renders nothing when the GPU is
 * free or its info is unavailable.
 */
export function GpuWarning() {
  const { data } = useQuery({
    queryKey: ["system"],
    queryFn: ({ signal }) => fetchSystem(signal),
    refetchInterval: POLL_INTERVAL_MS,
    retry: false,
  });

  if (!shouldWarnAboutGpu(data?.gpu)) {
    return null;
  }

  return <GpuWarningMessage processes={data?.gpu?.other_processes ?? []} />;
}
