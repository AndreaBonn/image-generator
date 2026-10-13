import { useEffect, useState } from "react";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { checkPromptLanguage } from "@/api/queries";
import type { PromptLanguage } from "@/api/types";
import { PromptExamples } from "@/components/create/PromptExamples";

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
  /** Task to offer next to the "Sembra italiano" warning (C7); omitted where there is none. */
  italianAlternative?: { label: string; onSwitch: () => void } | null;
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
  italianAlternative = null,
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

      <PromptExamples examples={examples} onUseExample={onUseExample} />

      {looksItalian ? (
        <div className="flex flex-wrap items-center gap-2">
          <p role="status" className="text-warning">
            Sembra italiano: questo modello capisce bene solo l'inglese.
          </p>
          {italianAlternative ? (
            <button
              type="button"
              onClick={italianAlternative.onSwitch}
              className="min-h-11 rounded-md border border-border bg-paper-2 px-3 py-1 text-xs text-ink hover:bg-paper-3"
            >
              Passa a {italianAlternative.label}, che capisce l&apos;italiano
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
