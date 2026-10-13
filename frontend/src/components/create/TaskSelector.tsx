import type { Task } from "@/api/types";
import { groupTasksBySource } from "@/lib/taskGroups";

interface TaskSelectorProps {
  tasks: Task[];
  selectedTaskId: string | null;
  onSelect: (taskId: string) => void;
}

/** Task picker as compact cards in two groups (C3): label, one-line description, disabled + reason. */
export function TaskSelector({ tasks, selectedTaskId, onSelect }: TaskSelectorProps) {
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
                onSelect={onSelect}
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
  onSelect: (taskId: string) => void;
}

function TaskCard({ task, isSelected, onSelect }: TaskCardProps) {
  return (
    <button
      type="button"
      disabled={!task.available}
      aria-pressed={isSelected}
      onClick={() => task.available && onSelect(task.id)}
      className={`flex min-h-11 flex-col items-start gap-0.5 rounded-md border px-3 py-2 text-left transition-colors ${
        isSelected ? "border-accent bg-paper-3" : "border-border bg-paper-2 hover:bg-paper-3"
      } ${!task.available ? "cursor-not-allowed opacity-60" : ""}`}
    >
      <span className="text-sm font-medium text-ink">{task.label}</span>
      <span className="text-xs text-ink-muted">{task.description}</span>
      {!task.available && task.unavailable_reason ? (
        <span className="text-xs text-warning">{task.unavailable_reason}</span>
      ) : null}
    </button>
  );
}
