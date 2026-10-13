import { useCallback, useEffect, useState } from "react";
import { useModelDownload, type UseModelDownloadResult } from "@/hooks/useModelDownload";
import { IDLE_QUEUE, stepQueue, type ModelQueue } from "@/lib/modelQueue";

export interface UseModelQueueResult {
  queue: ModelQueue;
  download: UseModelDownloadResult;
  startAll: (ids: string[]) => void;
  /** Restarts the model that failed, then carries on with the rest. */
  retry: () => void;
}

/** Downloads several models in sequence on top of the single app-wide download. */
export function useModelQueue(): UseModelQueueResult {
  const download = useModelDownload();
  const { start } = download;
  const [queue, setQueue] = useState<ModelQueue>(IDLE_QUEUE);
  useEffect(() => {
    const step = stepQueue(queue, download.state);
    if (!step) return;
    setQueue(step.next);
    if (step.startId) void start(step.startId);
  }, [queue, download.state, start]);

  const startAll = useCallback(
    (ids: string[]) => {
      const [first] = ids;
      if (first === undefined) return;
      setQueue({ ids, index: 0, phase: "running" });
      void start(first);
    },
    [start],
  );

  const retry = useCallback(() => {
    const current = queue.ids[queue.index];
    if (current === undefined) return;
    setQueue((prev) => ({ ...prev, phase: "running" }));
    void start(current);
  }, [queue, start]);

  return { queue, download, startAll, retry };
}
