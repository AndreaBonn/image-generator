import { useId, type ReactNode } from "react";

interface ActionCardProps {
  title: string;
  hint?: string;
  children: ReactNode;
}

/** One Migliora card per result the user wants (P1), with the fields that action needs inside. */
export function ActionCard({ title, hint, children }: ActionCardProps) {
  const titleId = useId();
  return (
    <section aria-labelledby={titleId} className="flex flex-col gap-3 rounded-md border border-border bg-paper-2 p-3">
      <div className="flex flex-col gap-0.5">
        <h2 id={titleId} className="text-base font-semibold text-ink">
          {title}
        </h2>
        {hint ? <p className="text-xs text-ink-muted">{hint}</p> : null}
      </div>
      {children}
    </section>
  );
}
