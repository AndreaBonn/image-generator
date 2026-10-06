import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { useModelDownload } from "@/hooks/useModelDownload";
import * as queries from "@/api/queries";
import { ApiError } from "@/api/errors";
import { installMockEventSource, latestEventSource } from "../mocks/mockEventSource";

describe("useModelDownload", () => {
  beforeEach(() => {
    installMockEventSource();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("starts idle with no model id", () => {
    const { result } = renderHook(() => useModelDownload());
    expect(result.current.state).toEqual({
      modelId: null, phase: "idle", bytes: null, total: null, error: null,
    });
  });

  it("calls POST /install and attributes progress events to the started model", async () => {
    const start = vi.spyOn(queries, "startModelDownload").mockResolvedValue(undefined);
    const { result } = renderHook(() => useModelDownload());
    const source = latestEventSource();

    await act(async () => {
      await result.current.start("flux2-klein");
    });
    expect(start).toHaveBeenCalledWith("flux2-klein");
    expect(result.current.state.phase).toBe("downloading");

    act(() => source.emit("progress", { bytes: 1000, total: 4000 }));
    await waitFor(() =>
      expect(result.current.state).toEqual({
        modelId: "flux2-klein", phase: "downloading", bytes: 1000, total: 4000, error: null,
      }),
    );
  });

  it("moves to verifying then completed on the terminal events", async () => {
    vi.spyOn(queries, "startModelDownload").mockResolvedValue(undefined);
    const { result } = renderHook(() => useModelDownload());
    const source = latestEventSource();

    await act(async () => {
      await result.current.start("flux2-klein");
    });

    act(() => source.emit("verifying", {}));
    await waitFor(() => expect(result.current.state.phase).toBe("verifying"));

    act(() => source.emit("completed", {}));
    await waitFor(() =>
      expect(result.current.state).toEqual({
        modelId: "flux2-klein", phase: "completed", bytes: null, total: null, error: null,
      }),
    );
  });

  it("surfaces a failed event with the backend's Italian code and message", async () => {
    vi.spyOn(queries, "startModelDownload").mockResolvedValue(undefined);
    const { result } = renderHook(() => useModelDownload());
    const source = latestEventSource();

    await act(async () => {
      await result.current.start("flux2-klein");
    });

    act(() =>
      source.emit("failed", { code: "CHECKSUM_MISMATCH", message: "Il file scaricato non corrisponde." }),
    );

    await waitFor(() =>
      expect(result.current.state).toEqual({
        modelId: "flux2-klein",
        phase: "failed",
        bytes: null,
        total: null,
        error: { code: "CHECKSUM_MISMATCH", message: "Il file scaricato non corrisponde." },
      }),
    );
  });

  it("resets to idle on a cancelled event", async () => {
    vi.spyOn(queries, "startModelDownload").mockResolvedValue(undefined);
    const { result } = renderHook(() => useModelDownload());
    const source = latestEventSource();

    await act(async () => {
      await result.current.start("flux2-klein");
    });
    act(() => source.emit("cancelled", {}));

    await waitFor(() =>
      expect(result.current.state).toEqual({
        modelId: null, phase: "idle", bytes: null, total: null, error: null,
      }),
    );
  });

  it("surfaces a failed phase immediately when the start POST itself rejects (409/507)", async () => {
    vi.spyOn(queries, "startModelDownload").mockRejectedValue(
      new ApiError({ code: "DOWNLOAD_IN_PROGRESS", message: "È già in corso un altro download.", status: 409 }),
    );
    const { result } = renderHook(() => useModelDownload());

    await act(async () => {
      await result.current.start("flux2-klein");
    });

    expect(result.current.state).toEqual({
      modelId: "flux2-klein",
      phase: "failed",
      bytes: null,
      total: null,
      error: { code: "DOWNLOAD_IN_PROGRESS", message: "È già in corso un altro download." },
    });
  });

  it("calls POST /install/cancel for the started model, and does nothing if nothing started", async () => {
    vi.spyOn(queries, "startModelDownload").mockResolvedValue(undefined);
    const cancel = vi.spyOn(queries, "cancelModelDownload").mockResolvedValue(undefined);
    const { result } = renderHook(() => useModelDownload());

    await act(async () => {
      await result.current.cancel();
    });
    expect(cancel).not.toHaveBeenCalled();

    await act(async () => {
      await result.current.start("flux2-klein");
    });
    await act(async () => {
      await result.current.cancel();
    });
    expect(cancel).toHaveBeenCalledWith("flux2-klein");
  });
});

describe("useModelDownload cancel failure", () => {
  beforeEach(() => {
    installMockEventSource();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("surfaces a failed cancel request as an error instead of rejecting silently", async () => {
    vi.spyOn(queries, "startModelDownload").mockResolvedValue(undefined);
    vi.spyOn(queries, "cancelModelDownload").mockRejectedValue(new Error("network down"));
    const { result } = renderHook(() => useModelDownload());

    await act(async () => {
      await result.current.start("flux2-klein");
    });
    await act(async () => {
      await result.current.cancel();
    });

    expect(result.current.state.phase).toBe("failed");
    expect(result.current.state.error?.message).toBeTruthy();
  });
});
