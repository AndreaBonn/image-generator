import { ActionButton } from "@/components/improve/ActionButton";
import { FactorButton } from "@/components/improve/FactorButton";
import { InfoTip } from "@/components/ui/InfoTip";
import { HELP_TEXTS } from "@/lib/helpTexts";

type UpscaleFactor = 2 | 4;

interface UpscaleActionProps {
  factor: UpscaleFactor;
  onFactorChange: (factor: UpscaleFactor) => void;
  disabledReason: string | null;
  isGenerating: boolean;
  isActive: boolean;
  onClick: () => void;
}

/** Plain "Ingrandisci" action: factor picker (×2/×4) + submit (SPEC.md § 11.2). */
export function UpscaleAction({
  factor,
  onFactorChange,
  disabledReason,
  isGenerating,
  isActive,
  onClick,
}: UpscaleActionProps) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="flex items-center gap-1 text-sm font-semibold text-ink">
        Ingrandisci
        <InfoTip text={HELP_TEXTS.upscaleFactor} label="Informazioni: Ingrandisci" />
      </legend>
      <div role="radiogroup" aria-label="Fattore di ingrandimento" className="flex gap-2">
        <FactorButton factor={2} selected={factor === 2} onSelect={onFactorChange} />
        <FactorButton factor={4} selected={factor === 4} onSelect={onFactorChange} />
      </div>
      <ActionButton
        label="Ingrandisci"
        disabledReason={disabledReason}
        isGenerating={isGenerating}
        isActive={isActive}
        onClick={onClick}
      />
    </fieldset>
  );
}
