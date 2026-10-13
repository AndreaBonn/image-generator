import type { ReactNode } from "react";

/** Numbered step title (M3): the badge is visual, screen readers hear "Passo N:". */
export function StepHeading({ step, children }: { step: number; children: ReactNode }) {
  return (
    <h2 className="flex items-center gap-2 text-sm font-semibold text-ink">
      <span className="sr-only">Passo {step}: </span>
      <span
        aria-hidden="true"
        className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-accent text-xs font-bold text-accent-ink"
      >
        {step}
      </span>
      {children}
    </h2>
  );
}
