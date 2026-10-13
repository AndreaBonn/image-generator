import { useQuery } from "@tanstack/react-query";
import { fetchActiveJobs, fetchTasks } from "@/api/queries";
import { useJobEvents } from "@/api/useJobEvents";

const POLL_INTERVAL_MS = 3_000;

/**
 * "Bozza veloce in corso · 75%" in the nav bar (N1): jobs started from any page,
 * including ones whose page the user has left, stay visible everywhere.
 */
export function ActiveJobsIndicator() {
  const activeQuery = useQuery({
    queryKey: ["jobs", "active"],
    queryFn: ({ signal }) => fetchActiveJobs(signal),
    refetchInterval: POLL_INTERVAL_MS,
  });
  const tasksQuery = useQuery({ queryKey: ["tasks"], queryFn: ({ signal }) => fetchTasks(signal) });
  const jobs = activeQuery.data ?? [];
  const first = jobs[0];
  const { latest } = useJobEvents(first?.job_id ?? null);

  if (!first) return null;

  let text = `${jobs.length} lavori in corso`;
  if (jobs.length === 1) {
    const label = tasksQuery.data?.find((task) => task.id === first.task_id)?.label ?? "Un lavoro";
    const percent = latest?.type === "progress" ? Math.round((latest.step / Math.max(latest.total, 1)) * 100) : null;
    text = percent === null ? `${label} in corso` : `${label} in corso · ${percent}%`;
  }

  return (
    <p
      role="status"
      className="order-2 flex min-h-11 shrink-0 items-center gap-2 rounded-full bg-paper-3 px-3 text-xs font-semibold text-accent-text sm:order-3"
    >
      <span aria-hidden="true" className="h-2 w-2 rounded-full bg-accent motion-safe:animate-pulse" />
      {text}
    </p>
  );
}
