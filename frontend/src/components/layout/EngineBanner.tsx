import { useQuery } from "@tanstack/react-query";
import { fetchHealth } from "@/api/queries";

const POLL_INTERVAL_MS = 10_000;

/**
 * Persistent banner shown whenever the engine is unreachable
 * (SPEC.md § 11.1, § 11.3). Polls GET /api/v1/health every 10s.
 */
export function EngineBanner() {
  const { data } = useQuery({
    queryKey: ["health"],
    queryFn: ({ signal }) => fetchHealth(signal),
    refetchInterval: POLL_INTERVAL_MS,
    retry: false,
  });

  if (!data || data.engine === "ok") {
    return null;
  }

  return (
    <div
      role="alert"
      className="flex flex-wrap items-center gap-2 bg-danger px-4 py-2 text-sm font-medium text-paper"
    >
      <span>Il motore non risponde.</span>
      <span>
        Avvialo da terminale con <code className="rounded bg-paper/20 px-1">./scripts/start.sh</code>.
      </span>
    </div>
  );
}
