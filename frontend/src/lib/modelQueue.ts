import type { ModelDownloadState } from "@/hooks/useModelDownload";

export type ModelQueuePhase = "idle" | "running" | "done" | "failed";

/** Models to download one after the other (the backend allows one download at a time). */
export interface ModelQueue {
  ids: string[];
  index: number;
  phase: ModelQueuePhase;
}

export const IDLE_QUEUE: ModelQueue = { ids: [], index: 0, phase: "idle" };

export interface QueueStep {
  next: ModelQueue;
  /** Model to start right away, or null when the queue settled. */
  startId: string | null;
}

/** Folds the single download's state into the queue; null when nothing changes. */
export function stepQueue(queue: ModelQueue, download: ModelDownloadState): QueueStep | null {
  if (queue.phase !== "running") return null;
  // A cancel resets the download to idle with no model id (useModelDownload).
  if (download.phase === "idle" && download.modelId === null) return { next: IDLE_QUEUE, startId: null };
  if (download.modelId !== queue.ids[queue.index]) return null;
  if (download.phase === "failed") return { next: { ...queue, phase: "failed" }, startId: null };
  if (download.phase !== "completed") return null;
  const nextId = queue.ids[queue.index + 1];
  if (nextId === undefined) return { next: { ...queue, phase: "done" }, startId: null };
  return { next: { ...queue, index: queue.index + 1 }, startId: nextId };
}
