import { useMemo } from "react";
import type { ExampleItem, Task } from "@/api/types";

/** What "Prova questo" hands back to CreatePage: enough to fill the form without
 * sending a job. `seed`/`aspectRatio` are omitted by the text-only variant, which
 * has no generated example to copy them from. */
export interface TryExamplePatch {
  taskId: string;
  prompt: string;
  seed?: number;
  aspectRatio?: string;
}

interface ExamplesPanelProps {
  examples: ExampleItem[];
  /** Creation tasks, for the task label shown on each card and the text-only
   * fallback's `prompt_examples` (SPEC.md § 11.3). */
  tasks: Task[];
  onTryExample: (patch: TryExamplePatch) => void;
}

const CARD_CLASS = "flex flex-col gap-2 rounded-md border border-border bg-paper-2 p-2 text-left";
const TRY_BUTTON_CLASS =
  "min-h-11 w-fit rounded-md border border-border px-3 py-2 text-sm font-medium text-ink hover:bg-paper-3";

/**
 * Shown in Crea only on first use (SPEC.md § 11.3): a ready-made prompt, seed and
 * format per example, so a new user can see a result without writing a prompt
 * first. "Prova questo" only fills the form, it never starts a job.
 */
export function ExamplesPanel({ examples, tasks, onTryExample }: ExamplesPanelProps) {
  const taskById = useMemo(() => new Map(tasks.map((task) => [task.id, task])), [tasks]);

  if (examples.length === 0) {
    return <TextOnlyExamples tasks={tasks} onTryExample={onTryExample} />;
  }

  return (
    <section className="flex flex-col gap-2 rounded-md border border-border bg-paper-2 p-3">
      <h2 className="text-sm font-semibold text-ink">Prova un esempio</h2>
      <div className="grid grid-cols-2 gap-2 sm:gap-3">
        {examples.map((example) => {
          const task = taskById.get(example.task_id);
          return (
            <article key={example.id} className={CARD_CLASS}>
              <img
                src={example.image_url}
                alt={example.prompt}
                width={example.width}
                height={example.height}
                loading="lazy"
                className="aspect-square w-full rounded-md object-cover"
              />
              {task ? <span className="text-xs font-medium text-ink-muted">{task.label}</span> : null}
              <p className="line-clamp-2 text-sm text-ink">{example.prompt}</p>
              <button
                type="button"
                onClick={() =>
                  onTryExample({
                    taskId: example.task_id,
                    prompt: example.prompt,
                    seed: example.seed,
                    aspectRatio: example.aspect_ratio,
                  })
                }
                className={TRY_BUTTON_CLASS}
              >
                Prova questo
              </button>
            </article>
          );
        })}
      </div>
    </section>
  );
}

/** Fallback when examples have not been generated yet (T082 CLI not run): each
 * available creation task's first `prompt_examples` entry, text only. */
function TextOnlyExamples({
  tasks,
  onTryExample,
}: {
  tasks: Task[];
  onTryExample: (patch: TryExamplePatch) => void;
}) {
  const entries = tasks.flatMap((task) => {
    const [prompt] = task.prompt_examples;
    return task.available && prompt ? [{ task, prompt }] : [];
  });

  if (entries.length === 0) return null;

  return (
    <section className="flex flex-col gap-2 rounded-md border border-border bg-paper-2 p-3">
      <h2 className="text-sm font-semibold text-ink">Prova un esempio</h2>
      <p className="text-xs text-ink-muted">Le immagini di esempio non sono ancora pronte: ecco qualche idea.</p>
      <ul className="flex flex-col gap-2">
        {entries.map(({ task, prompt }) => (
          <li key={task.id} className={CARD_CLASS}>
            <span className="text-xs font-medium text-ink-muted">{task.label}</span>
            <p className="line-clamp-2 text-sm text-ink">{prompt}</p>
            <button
              type="button"
              onClick={() => onTryExample({ taskId: task.id, prompt })}
              className={TRY_BUTTON_CLASS}
            >
              Prova questo
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
