import { describe, expect, it } from "vitest";
import { IDLE_QUEUE, stepQueue, type ModelQueue } from "@/lib/modelQueue";
import type { ModelDownloadState } from "@/hooks/useModelDownload";

const running: ModelQueue = { ids: ["a", "b"], index: 0, phase: "running" };

function download(overrides: Partial<ModelDownloadState>): ModelDownloadState {
  return { modelId: "a", phase: "downloading", bytes: 0, total: null, error: null, ...overrides };
}

describe("stepQueue", () => {
  it("does nothing while the current model is still downloading", () => {
    expect(stepQueue(running, download({}))).toBeNull();
  });

  it("starts the next model when the current one completes", () => {
    expect(stepQueue(running, download({ phase: "completed" }))).toEqual({
      next: { ids: ["a", "b"], index: 1, phase: "running" },
      startId: "b",
    });
  });

  it("finishes after the last model completes", () => {
    const last: ModelQueue = { ...running, index: 1 };
    expect(stepQueue(last, download({ modelId: "b", phase: "completed" }))).toEqual({
      next: { ...last, phase: "done" },
      startId: null,
    });
  });

  it("stops on a failure and keeps the index for Riprova", () => {
    expect(stepQueue(running, download({ phase: "failed" }))).toEqual({
      next: { ...running, phase: "failed" },
      startId: null,
    });
  });

  it("returns to idle when the download is cancelled", () => {
    expect(stepQueue(running, download({ modelId: null, phase: "idle" }))).toEqual({
      next: IDLE_QUEUE,
      startId: null,
    });
  });

  it("ignores events for a model it did not start", () => {
    expect(stepQueue(running, download({ modelId: "other", phase: "completed" }))).toBeNull();
  });

  it("ignores download events when the queue is not running", () => {
    expect(stepQueue(IDLE_QUEUE, download({ phase: "completed" }))).toBeNull();
  });
});
