import { useQuery } from "@tanstack/react-query";
import { fetchExamples } from "@/api/queries";
import { CopyableCommand } from "@/components/ui/CopyableCommand";

const GENERATE_COMMAND = "cd backend && uv run python -m app.cli.assets examples";

/** "Esempi" status row: whether the first-use examples (T082) have been
 * generated, and the command to generate them (SPEC.md § 11.2, O10). */
export function ExamplesCard() {
  const examplesQuery = useQuery({ queryKey: ["examples"], queryFn: ({ signal }) => fetchExamples(signal) });

  return (
    <section className="flex flex-col gap-2 rounded-md border border-border bg-paper-2 p-3">
      <h2 className="text-sm font-semibold text-ink">Esempi</h2>
      <ExamplesStatus
        isLoading={examplesQuery.isLoading}
        isError={examplesQuery.isError}
        count={examplesQuery.data?.examples.length ?? 0}
      />
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <CopyableCommand command={GENERATE_COMMAND} />
      </div>
    </section>
  );
}

function ExamplesStatus({
  isLoading,
  isError,
  count,
}: {
  isLoading: boolean;
  isError: boolean;
  count: number;
}) {
  if (isLoading) {
    return <p className="text-sm text-ink-muted">Verifica in corso...</p>;
  }
  if (isError) {
    return <p className="text-sm text-danger">Impossibile leggere lo stato degli esempi.</p>;
  }
  if (count === 0) {
    return <p className="text-sm text-ink-muted">Nessun esempio presente.</p>;
  }
  return <p className="text-sm text-ink">{count} esempi presenti.</p>;
}

/** Same copy-to-clipboard style as ModelsTable's install command row. */
