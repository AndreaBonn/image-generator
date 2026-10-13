interface PromptExamplesProps {
  examples: string[];
  onUseExample: (text: string) => void;
}

/** Clickable example descriptions as compact chips: a click fills the description field. */
export function PromptExamples({ examples, onUseExample }: PromptExamplesProps) {
  if (examples.length === 0) return null;
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs font-medium text-ink-muted">Esempi (clicca per usarli)</span>
      <div className="flex flex-wrap gap-2">
        {examples.map((example) => (
          <button
            key={example}
            type="button"
            onClick={() => onUseExample(example)}
            className="min-h-11 rounded-md border border-border bg-paper-2 px-3 py-1 text-left text-xs text-ink-muted hover:bg-paper-3"
          >
            {example}
          </button>
        ))}
      </div>
    </div>
  );
}
