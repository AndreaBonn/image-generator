import { familyLabel } from "@/lib/modelFamily";

export function LoadedModelCard({ family }: { family: string | null }) {
  return (
    <section className="flex flex-col gap-1 rounded-md border border-border bg-paper-2 p-3">
      <h2 className="text-sm font-semibold text-ink">Modello in memoria</h2>
      <p className="text-sm text-ink">{familyLabel(family)}</p>
    </section>
  );
}
