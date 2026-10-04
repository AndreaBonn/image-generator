import { familyLabel } from "@/lib/modelFamily";
import { InfoTip } from "@/components/ui/InfoTip";
import { HELP_TEXTS } from "@/lib/helpTexts";

export function LoadedModelCard({ family }: { family: string | null }) {
  return (
    <section className="flex flex-col gap-1 rounded-md border border-border bg-paper-2 p-3">
      <h2 className="flex items-center gap-1 text-sm font-semibold text-ink">
        Modello in memoria
        <InfoTip text={HELP_TEXTS.loadedModel} label="Informazioni: Modello in memoria" />
      </h2>
      <p className="text-sm text-ink">{familyLabel(family)}</p>
    </section>
  );
}
