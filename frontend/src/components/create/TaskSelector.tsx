import type { Task } from "@/api/types";
import { canOfferModelDownload } from "@/lib/missingModels";
import { groupTasksBySource, languageTag } from "@/lib/taskGroups";

interface TaskSelectorProps {
  tasks: Task[];
  selectedTaskId: string | null;
  onSelect: (taskId: string) => void;
  /** Model family already in GPU memory: its tasks start without a model switch (C4). */
  loadedFamily?: string | null;
  /** When given, an unavailable task that only lacks models stays clickable and asks to download them. */
  onRequestModels?: (task: Task) => void;
}

/** Task picker as compact cards in two groups (C3): label, one-line description, disabled + reason. */
export function TaskSelector({
  tasks,
  selectedTaskId,
  onSelect,
  loadedFamily = null,
  onRequestModels,
}: TaskSelectorProps) {
  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="mb-1 text-sm font-semibold text-ink">Cosa vuoi creare?</legend>
      {groupTasksBySource(tasks).map((group) => (
        <div key={group.label} role="group" aria-label={group.label} className="flex flex-col gap-1.5">
          <p aria-hidden="true" className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
            {group.label}
          </p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {group.tasks.map((task) => (
              <TaskCard
                key={task.id}
                task={task}
                isSelected={task.id === selectedTaskId}
                isReady={task.family === loadedFamily}
                onSelect={onSelect}
                onRequestModels={onRequestModels}
              />
            ))}
          </div>
        </div>
      ))}
    </fieldset>
  );
}

interface TaskCardProps {
  task: Task;
  isSelected: boolean;
  isReady: boolean;
  onSelect: (taskId: string) => void;
  onRequestModels?: (task: Task) => void;
}

const TAG_CLASS = "rounded-full border px-2 text-[11px] leading-5";

function TaskCard({ task, isSelected, isReady, onSelect, onRequestModels }: TaskCardProps) {
  const offersDownload = onRequestModels !== undefined && canOfferModelDownload(task);
  function handleClick() {
    if (task.available) onSelect(task.id);
    else if (offersDownload) onRequestModels?.(task);
  }
  return (
    <button
      type="button"
      disabled={!task.available && !offersDownload}
      aria-pressed={isSelected}
      onClick={handleClick}
      className={`flex min-h-11 flex-col items-start gap-0.5 rounded-md border px-3 py-2 text-left transition-colors ${
        isSelected ? "border-accent bg-paper-3" : "border-border bg-paper-2 hover:bg-paper-3"
      } ${!task.available && !offersDownload ? "cursor-not-allowed opacity-60" : ""}`}
    >
      <span className="text-sm font-medium text-ink">{task.label}</span>
      <span className="text-xs text-ink-muted">{task.description}</span>
      <span className="mt-1 flex flex-wrap gap-1">
        {task.duration_hint ? (
          <span className={`${TAG_CLASS} border-border text-ink-muted`}>{task.duration_hint}</span>
        ) : null}
        <span className={`${TAG_CLASS} border-accent text-accent-text`}>
          {languageTag(task.prompt_language.required)}
        </span>
        {isReady ? <span className={`${TAG_CLASS} border-success text-success`}>pronto subito</span> : null}
      </span>
      {offersDownload ? (
        <span className="text-xs text-warning">Mancano dei modelli: clicca per scaricarli.</span>
      ) : !task.available && task.unavailable_reason ? (
        <span className="text-xs text-warning">{task.unavailable_reason}</span>
      ) : null}
    </button>
  );
}
