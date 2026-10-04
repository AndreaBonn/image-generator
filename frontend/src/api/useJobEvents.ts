import { useEffect, useRef, useState } from "react";
import type { JobEvent } from "@/api/types";

/**
 * Assumption on the wire format (backend not built yet, BASIS: inferred
 * from SPEC.md § 7.2): each SSE frame's `event:` name equals the event
 * `type` ("queued", "model_switch", "progress", "completed", "failed",
 * "cancelled"), and `data:` carries the JSON payload without a `type`
 * field. We re-attach `type` from the event name when parsing. If the
 * backend instead nests `type` inside `data`, only `parseEvent` below
 * needs to change.
 */
function parseEvent(eventName: string, raw: string): JobEvent | null {
  try {
    const payload = JSON.parse(raw) as Record<string, unknown>;
    return { type: eventName, ...payload } as JobEvent;
  } catch {
    return null;
  }
}

const TERMINAL_TYPES = new Set(["completed", "failed", "cancelled"]);
const EVENT_NAMES = ["queued", "model_switch", "progress", "completed", "failed", "cancelled"];

export interface UseJobEventsResult {
  events: JobEvent[];
  latest: JobEvent | null;
  isDone: boolean;
  connectionError: boolean;
}

/** Subscribes to GET /api/v1/jobs/{id}/events while `jobId` is set. */
export function useJobEvents(jobId: string | null): UseJobEventsResult {
  const [events, setEvents] = useState<JobEvent[]>([]);
  const [connectionError, setConnectionError] = useState(false);
  const sourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    setEvents([]);
    setConnectionError(false);

    if (!jobId) {
      return;
    }

    const source = new EventSource(`/api/v1/jobs/${jobId}/events`);
    sourceRef.current = source;

    const handlers: Array<[string, (ev: MessageEvent) => void]> = EVENT_NAMES.map(
      (name) => [
        name,
        (ev: MessageEvent) => {
          const parsed = parseEvent(name, ev.data as string);
          if (!parsed) return;
          setEvents((prev) => [...prev, parsed]);
          if (TERMINAL_TYPES.has(parsed.type)) {
            source.close();
          }
        },
      ],
    );
    for (const [name, handler] of handlers) {
      source.addEventListener(name, handler);
    }

    source.onerror = () => {
      setConnectionError(true);
    };

    return () => {
      for (const [name, handler] of handlers) {
        source.removeEventListener(name, handler);
      }
      source.close();
      sourceRef.current = null;
    };
  }, [jobId]);

  const latest = events.at(-1) ?? null;
  const isDone = latest !== null && TERMINAL_TYPES.has(latest.type);

  return { events, latest, isDone, connectionError };
}
