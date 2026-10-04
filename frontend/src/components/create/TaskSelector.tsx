import type { Task } from "@/api/types";
import { InfoTip } from "@/components/ui/InfoTip";
import { HELP_TEXTS } from "@/lib/helpTexts";

interface TaskSelectorProps {
  tasks: Task[];
  selectedTaskId: string | null;
  onSelect: (taskId: string) => void;
}

/** Task picker as cards: label, one-line description, disabled + reason. */
export function TaskSelector({ tasks, selectedTaskId, onSelect }: TaskSelectorProps) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-1 flex items-center gap-1 text-sm font-semibold text-ink">
        Compito
        <InfoTip text={HELP_TEXTS.taskSelector} label="Informazioni: Compito" />
      </legend>
      <div className="flex flex-col gap-2">
        {tasks.map((task) => {
          const isSelected = task.id === selectedTaskId;
          return (
            <button
              key={task.id}
              type="button"
              disabled={!task.available}
              aria-pressed={isSelected}
              onClick={() => task.available && onSelect(task.id)}
              className={`flex min-h-11 flex-col items-start gap-0.5 rounded-md border px-3 py-2 text-left transition-colors ${
                isSelected
                  ? "border-accent bg-paper-3"
                  : "border-border bg-paper-2 hover:bg-paper-3"
              } ${!task.available ? "cursor-not-allowed opacity-60" : ""}`}
            >
              <span className="text-sm font-medium text-ink">{task.label}</span>
              <span className="text-xs text-ink-muted">{task.description}</span>
              {!task.available && task.unavailable_reason ? (
                <span className="text-xs text-warning">{task.unavailable_reason}</span>
              ) : null}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}
