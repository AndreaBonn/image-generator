import type { Task } from "@/api/types";

export interface TaskGroup {
  label: string;
  tasks: Task[];
}

/**
 * Splits the creation tasks by what they start from (C3): a description only,
 * or images the user must provide (min_references > 0). Order within each
 * group follows the catalog; empty groups are dropped.
 */
export function groupTasksBySource(tasks: Task[]): TaskGroup[] {
  const groups: TaskGroup[] = [
    { label: "Da una descrizione", tasks: tasks.filter((task) => task.min_references === 0) },
    { label: "Partendo da tue immagini", tasks: tasks.filter((task) => task.min_references > 0) },
  ];
  return groups.filter((group) => group.tasks.length > 0);
}
