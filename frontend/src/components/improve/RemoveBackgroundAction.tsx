import { ActionButton } from "@/components/improve/ActionButton";
import { InfoTip } from "@/components/ui/InfoTip";
import { HELP_TEXTS } from "@/lib/helpTexts";

interface RemoveBackgroundActionProps {
  disabledReason: string | null;
  isGenerating: boolean;
  isActive: boolean;
  onClick: () => void;
}

/**
 * "Rimuovi lo sfondo" (F2, group migliora): no prompt needed, the engine
 * finds the subject on its own. Result is a transparent PNG, shown on a
 * checkerboard elsewhere (ImproveResultCard, GenerationCard).
 */
export function RemoveBackgroundAction({
  disabledReason,
  isGenerating,
  isActive,
  onClick,
}: RemoveBackgroundActionProps) {
  return (
    <div className="flex items-center gap-1">
      <ActionButton
        label="Rimuovi lo sfondo"
        disabledReason={disabledReason}
        isGenerating={isGenerating}
        isActive={isActive}
        onClick={onClick}
      />
      <InfoTip text={HELP_TEXTS.rimuoviSfondo} label="Informazioni: Rimuovi lo sfondo" />
    </div>
  );
}
