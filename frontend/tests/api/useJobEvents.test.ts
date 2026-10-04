import { describe, expect, it, beforeEach } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { useJobEvents } from "@/api/useJobEvents";
import { installMockEventSource, latestEventSource } from "../mocks/mockEventSource";

describe("useJobEvents", () => {
  beforeEach(() => {
    installMockEventSource();
  });

  it("renders progress through queued, a progress step and completion", async () => {
    const { result } = renderHook(() => useJobEvents("job-1"));

    const source = latestEventSource();

    act(() => source.emit("queued", { position: 2 }));
    await waitFor(() =>
      expect(result.current.latest).toEqual({ type: "queued", position: 2 }),
    );
    expect(result.current.isDone).toBe(false);

    act(() => source.emit("progress", { step: 2, total: 4 }));
    await waitFor(() =>
      expect(result.current.latest).toEqual({ type: "progress", step: 2, total: 4 }),
    );
    expect(result.current.isDone).toBe(false);

    act(() => source.emit("completed", { generation_ids: ["gen-1"] }));
    await waitFor(() => expect(result.current.isDone).toBe(true));
    expect(result.current.latest).toEqual({
      type: "completed",
      generation_ids: ["gen-1"],
    });
    expect(result.current.events.map((event) => event.type)).toEqual([
      "queued",
      "progress",
      "completed",
    ]);
    expect(source.closed).toBe(true);
  });

  it("does not open a connection when jobId is null", () => {
    renderHook(() => useJobEvents(null));
    expect(() => latestEventSource()).toThrow();
  });

  it("drops a frame whose data is not valid JSON instead of recording an event", async () => {
    const { result } = renderHook(() => useJobEvents("job-2"));
    const source = latestEventSource();

    // MockEventSource.emit JSON.stringifies its payload; passing undefined
    // makes `ev.data` undefined, which JSON.parse cannot parse (it coerces
    // to the string "undefined" and throws), exercising parseEvent's catch.
    act(() => source.emit("progress", undefined));

    expect(result.current.events).toEqual([]);
    expect(result.current.latest).toBeNull();

    // Prove the handler still works afterwards (paired positive case).
    act(() => source.emit("progress", { step: 1, total: 4 }));
    await waitFor(() =>
      expect(result.current.latest).toEqual({ type: "progress", step: 1, total: 4 }),
    );
  });

  it("tracks the latest preview URL separately from `latest`/`events` (A2)", async () => {
    const { result } = renderHook(() => useJobEvents("job-4"));
    const source = latestEventSource();

    expect(result.current.latestPreviewUrl).toBeNull();

    act(() => source.emit("progress", { step: 1, total: 4 }));
    await waitFor(() =>
      expect(result.current.latest).toEqual({ type: "progress", step: 1, total: 4 }),
    );

    act(() => source.emit("preview", { url: "/api/v1/jobs/job-4/preview?n=1" }));
    await waitFor(() =>
      expect(result.current.latestPreviewUrl).toBe("/api/v1/jobs/job-4/preview?n=1"),
    );
    // A preview frame must not become `latest` or appear in `events`: it
    // would otherwise displace the step-counter message consumers render.
    expect(result.current.latest).toEqual({ type: "progress", step: 1, total: 4 });
    expect(result.current.events.map((event) => event.type)).toEqual(["progress"]);

    act(() => source.emit("preview", { url: "/api/v1/jobs/job-4/preview?n=2" }));
    await waitFor(() =>
      expect(result.current.latestPreviewUrl).toBe("/api/v1/jobs/job-4/preview?n=2"),
    );
  });

  it("resets the preview URL when a new job starts", () => {
    const { result, rerender } = renderHook(({ jobId }) => useJobEvents(jobId), {
      initialProps: { jobId: "job-5" as string | null },
    });
    const source = latestEventSource();

    act(() => source.emit("preview", { url: "/api/v1/jobs/job-5/preview?n=1" }));
    expect(result.current.latestPreviewUrl).toBe("/api/v1/jobs/job-5/preview?n=1");

    rerender({ jobId: "job-6" });

    expect(result.current.latestPreviewUrl).toBeNull();
  });

  it("flags a connection error reported by the EventSource", () => {
    const { result } = renderHook(() => useJobEvents("job-3"));
    const source = latestEventSource();

    expect(result.current.connectionError).toBe(false);

    act(() => source.onerror?.(new Event("error")));

    expect(result.current.connectionError).toBe(true);
  });
});
