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
});
