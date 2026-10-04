interface ActionButtonProps {
  label: string;
  disabledReason: string | null;
  isGenerating: boolean;
  isActive: boolean;
  onClick: () => void;
}

/** Primary action button shared by every Migliora action (SPEC.md § 11.2). */
export function ActionButton({ label, disabledReason, isGenerating, isActive, onClick }: ActionButtonProps) {
  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        onClick={onClick}
        disabled={disabledReason !== null || isGenerating}
        className="min-h-11 w-fit rounded-md bg-accent px-4 py-2 text-sm font-semibold text-accent-ink disabled:cursor-not-allowed disabled:bg-paper-3 disabled:text-ink-muted"
      >
        {isGenerating && isActive ? "Generazione in corso..." : label}
      </button>
      {disabledReason && !isGenerating ? <p className="text-xs text-ink-muted">{disabledReason}</p> : null}
    </div>
  );
}
