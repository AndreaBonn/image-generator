import { SeedField } from "@/components/create/SeedField";
import { AdvancedOptions } from "@/components/create/AdvancedOptions";
import type { Task } from "@/api/types";

interface FreeEditOptionsProps {
  task: Task;
  seed: number | null;
  seedLocked: boolean;
  onSeedChange: (seed: number | null) => void;
  onToggleSeedLocked: (locked: boolean) => void;
  steps: number | null;
  cfg: number | null;
  onStepsChange: (steps: number | null) => void;
  onCfgChange: (cfg: number | null) => void;
}

/**
 * Seed + advanced steps/cfg for "Modifica con le parole" (F2). No negative
 * prompt: the flux2_klein family behind this task does not support one
 * (config/tasks.yaml `modifica_libera.supports_negative: false`).
 */
export function FreeEditOptions({
  task,
  seed,
  seedLocked,
  onSeedChange,
  onToggleSeedLocked,
  steps,
  cfg,
  onStepsChange,
  onCfgChange,
}: FreeEditOptionsProps) {
  return (
    <>
      <SeedField seed={seed} locked={seedLocked} onChange={onSeedChange} onToggleLocked={onToggleSeedLocked} />
      <AdvancedOptions
        task={task}
        steps={steps}
        cfg={cfg}
        negativePrompt=""
        onStepsChange={onStepsChange}
        onCfgChange={onCfgChange}
        onNegativePromptChange={() => {}}
      />
    </>
  );
}
