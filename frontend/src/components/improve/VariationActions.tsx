import { ActionButton } from "@/components/improve/ActionButton";
import { InfoTip } from "@/components/ui/InfoTip";
import { HELP_TEXTS } from "@/lib/helpTexts";

interface VariationActionsProps {
  subtleDisabledReason: string | null;
  strongDisabledReason: string | null;
  isGenerating: boolean;
  activeAction: string | null;
  onSelect: (actionId: "variazione_sottile" | "variazione_forte") => void;
}

/** "Variazione leggera" / "Variazione forte" buttons (SPEC.md § 11.2). */
export function VariationActions({
  subtleDisabledReason,
  strongDisabledReason,
  isGenerating,
  activeAction,
  onSelect,
}: VariationActionsProps) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-1">
        <ActionButton
          label="Variazione leggera"
          disabledReason={subtleDisabledReason}
          isGenerating={isGenerating}
          isActive={activeAction === "variazione_sottile"}
          onClick={() => onSelect("variazione_sottile")}
        />
        <InfoTip text={HELP_TEXTS.variationSubtle} label="Informazioni: Variazione leggera" />
      </div>
      <div className="flex items-center gap-1">
        <ActionButton
          label="Variazione forte"
          disabledReason={strongDisabledReason}
          isGenerating={isGenerating}
          isActive={activeAction === "variazione_forte"}
          onClick={() => onSelect("variazione_forte")}
        />
        <InfoTip text={HELP_TEXTS.variationStrong} label="Informazioni: Variazione forte" />
      </div>
    </div>
  );
}
