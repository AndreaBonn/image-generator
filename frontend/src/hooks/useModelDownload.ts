import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError } from "@/api/errors";
import { cancelModelDownload, startModelDownload } from "@/api/queries";
import type { ModelDownloadEvent } from "@/api/types";

const EVENT_NAMES = ["progress", "verifying", "completed", "failed", "cancelled"] as const;

function parseEvent(name: string, raw: string): ModelDownloadEvent | null {
  try {
    const payload = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
    return { type: name, ...payload } as ModelDownloadEvent;
  } catch {
    return null;
  }
}

export type ModelDownloadPhase =
  | "idle"
  | "downloading"
  | "verifying"
  | "completed"
  | "failed"
  | "cancelled";

export interface ModelDownloadState {
  /** Model id this hook started with `start()`, or null if nothing started here
   * (including when another session/CLI is downloading: the SSE stream carries
   * no model id, see ModelDownloadEvent). */
  modelId: string | null;
  phase: ModelDownloadPhase;
  bytes: number | null;
  total: number | null;
  error: { code: string; message: string } | null;
}

const IDLE_STATE: ModelDownloadState = {
  modelId: null,
  phase: "idle",
  bytes: null,
  total: null,
  error: null,
};

export interface UseModelDownloadResult {
  state: ModelDownloadState;
  start: (modelId: string) => Promise<void>;
  cancel: () => Promise<void>;
}

function toDownloadError(error: unknown): { code: string; message: string } {
  if (error instanceof ApiError) return { code: error.code, message: error.message };
  return { code: "UNKNOWN_ERROR", message: "Si è verificato un errore imprevisto. Riprova." };
}

function applyEvent(
  prev: ModelDownloadState,
  activeModelId: string | null,
  event: ModelDownloadEvent,
): ModelDownloadState {
  switch (event.type) {
    case "progress":
      return {
        modelId: activeModelId,
        phase: "downloading",
        bytes: event.bytes,
        total: event.total,
        error: null,
      };
    case "verifying":
      return { ...prev, modelId: activeModelId, phase: "verifying", error: null };
    case "completed":
      return { modelId: activeModelId, phase: "completed", bytes: null, total: null, error: null };
    case "failed":
      return {
        modelId: activeModelId,
        phase: "failed",
        bytes: null,
        total: null,
        error: { code: event.code, message: event.message },
      };
    case "cancelled":
      return IDLE_STATE;
    default:
      return prev;
  }
}

/**
 * Tracks the single, app-wide model download (SPEC.md § 7.2, backend
 * T026-T028: `POST /models/{id}/install`, `/install/cancel`, SSE snapshot
 * on `GET /models/downloads/events`). One instance is shared by every row of
 * ModelsTable so only one download is ever attributed to a model id at a time.
 */
export function useModelDownload(): UseModelDownloadResult {
  const [state, setState] = useState<ModelDownloadState>(IDLE_STATE);
  const modelIdRef = useRef<string | null>(null);

  useEffect(() => {
    const source = new EventSource("/api/v1/models/downloads/events");
    const handlers = EVENT_NAMES.map((name) => {
      const handler = (ev: MessageEvent) => {
        const event = parseEvent(name, ev.data as string);
        if (!event) return;
        const activeModelId = modelIdRef.current;
        if (event.type === "completed" || event.type === "cancelled") {
          modelIdRef.current = null;
        }
        setState((prev) => applyEvent(prev, activeModelId, event));
      };
      source.addEventListener(name, handler);
      return [name, handler] as const;
    });
    return () => {
      for (const [name, handler] of handlers) source.removeEventListener(name, handler);
      source.close();
    };
  }, []);

  const start = useCallback(async (modelId: string) => {
    modelIdRef.current = modelId;
    setState({ modelId, phase: "downloading", bytes: 0, total: null, error: null });
    try {
      await startModelDownload(modelId);
    } catch (error) {
      modelIdRef.current = null;
      setState({ modelId, phase: "failed", bytes: null, total: null, error: toDownloadError(error) });
    }
  }, []);

  const cancel = useCallback(async () => {
    const modelId = modelIdRef.current;
    if (!modelId) return;
    try {
      await cancelModelDownload(modelId);
    } catch (error) {
      setState((prev) => ({ ...prev, phase: "failed", error: toDownloadError(error) }));
    }
  }, []);

  return { state, start, cancel };
}
