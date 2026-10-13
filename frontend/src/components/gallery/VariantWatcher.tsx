import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useJobEvents } from "@/api/useJobEvents";

interface VariantWatcherProps {
  jobId: string;
}

/**
 * Follows a variant started from the Galleria detail (G6): says it is being
 * prepared, then refreshes the gallery list once the job ends.
 */
export function VariantWatcher({ jobId }: VariantWatcherProps) {
  const { latest, isDone } = useJobEvents(jobId);
  const queryClient = useQueryClient();

  useEffect(() => {
    if (isDone) void queryClient.invalidateQueries({ queryKey: ["generations"] });
  }, [isDone, queryClient]);

  let message = "Nuova variante in preparazione...";
  if (latest?.type === "completed") message = "Nuova variante pronta nella Galleria.";
  else if (latest?.type === "failed") message = `La nuova variante non è riuscita: ${latest.message}`;
  else if (latest?.type === "cancelled") message = "La nuova variante è stata annullata.";

  return (
    <p role="status" className="rounded-md border border-border bg-paper-2 px-3 py-2 text-sm text-ink">
      {message}
    </p>
  );
}
