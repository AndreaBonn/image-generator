import { vi } from "vitest";

type Listener = (event: MessageEvent) => void;

/**
 * Minimal EventSource stand-in: jsdom has no native implementation.
 * Records listeners per named event and lets tests dispatch them
 * synchronously to drive useJobEvents.
 */
export class MockEventSource {
  static instances: MockEventSource[] = [];
  url: string;
  closed = false;
  onerror: ((ev: Event) => void) | null = null;
  private listeners = new Map<string, Set<Listener>>();

  constructor(url: string) {
    this.url = url;
    MockEventSource.instances.push(this);
  }

  addEventListener(name: string, listener: Listener) {
    if (!this.listeners.has(name)) this.listeners.set(name, new Set());
    this.listeners.get(name)?.add(listener);
  }

  removeEventListener(name: string, listener: Listener) {
    this.listeners.get(name)?.delete(listener);
  }

  close() {
    this.closed = true;
  }

  emit(name: string, data: unknown) {
    const event = { data: JSON.stringify(data) } as MessageEvent;
    for (const listener of this.listeners.get(name) ?? []) {
      listener(event);
    }
  }
}

export function installMockEventSource(): void {
  MockEventSource.instances = [];
  vi.stubGlobal("EventSource", MockEventSource);
}

export function latestEventSource(): MockEventSource {
  const instance = MockEventSource.instances[MockEventSource.instances.length - 1];
  if (!instance) throw new Error("No MockEventSource instance created yet.");
  return instance;
}
