import { useEffect, useState } from "react";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { checkPromptLanguage } from "@/api/queries";
import type { PromptLanguage } from "@/api/types";

// Short note next to the language badge (C6); the full reason lives with the tips.
const LANGUAGE_NOTES: Record<PromptLanguage["required"], string | null> = {
  en: "in italiano perde dettagli",
  it: null,
  any: null,
};

interface PromptGuideProps {
  promptLanguage: PromptLanguage;
  tips: string[];
  examples: string[];
  prompt: string;
  onUseExample: (text: string) => void;
}

/**
 * Prompt guidance (SPEC.md § 3.3): language badge + reason, expandable
 * tips, clickable examples, and a non-blocking warning when the prompt
 * looks Italian but the task needs English.
 */
export function PromptGuide({
  promptLanguage,
  tips,
  examples,
  prompt,
  onUseExample,
}: PromptGuideProps) {
  const [tipsOpen, setTipsOpen] = useState(false);
  const [looksItalian, setLooksItalian] = useState(false);
  const debouncedPrompt = useDebouncedValue(prompt, 400);

  useEffect(() => {
    if (promptLanguage.required !== "en" || debouncedPrompt.trim().length === 0) {
      setLooksItalian(false);
      return;
    }
    let cancelled = false;
    checkPromptLanguage(debouncedPrompt)
      .then((result) => {
        if (!cancelled) setLooksItalian(result.looks_italian);
      })
      .catch(() => {
        if (!cancelled) setLooksItalian(false);
      });
    return () => {
      cancelled = true;
    };
  }, [debouncedPrompt, promptLanguage.required]);

  return (
    <div className="flex flex-col gap-2 text-sm">
      <div className="flex flex-wrap items-center gap-x-2">
        <span className="rounded-full bg-paper-3 px-2 py-0.5 text-xs font-medium text-accent-text">
          {promptLanguage.label}
        </span>
        {LANGUAGE_NOTES[promptLanguage.required] ? (
          <span className="text-xs text-ink-muted">{LANGUAGE_NOTES[promptLanguage.required]}</span>
        ) : null}
        {tips.length > 0 ? (
          <button
            type="button"
            onClick={() => setTipsOpen((open) => !open)}
            aria-expanded={tipsOpen}
            className="min-h-11 text-xs text-accent-text underline"
          >
            {tipsOpen ? "Nascondi consigli" : "Mostra consigli"}
          </button>
        ) : null}
      </div>

      {tips.length === 0 ? <p className="text-xs text-ink-muted">{promptLanguage.reason}</p> : null}
      {tips.length > 0 && tipsOpen ? (
        <div className="flex flex-col gap-1 rounded-md bg-paper-2 p-2 text-ink-muted">
          <p>{promptLanguage.reason}</p>
          <ul className="list-inside list-disc">
            {tips.map((tip) => (
              <li key={tip}>{tip}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {examples.length > 0 ? (
        <div className="flex flex-col gap-1">
          <span className="text-xs font-medium text-ink-muted">Esempi (clicca per usarli)</span>
          {examples.map((example) => (
            <button
              key={example}
              type="button"
              onClick={() => onUseExample(example)}
              className="min-h-11 rounded-md border border-border bg-paper-2 px-2 py-1 text-left text-xs text-ink-muted hover:bg-paper-3"
            >
              {example}
            </button>
          ))}
        </div>
      ) : null}

      {looksItalian ? (
        <p role="status" className="text-warning">
          Sembra italiano: questo modello capisce bene solo l'inglese.
        </p>
      ) : null}
    </div>
  );
}
