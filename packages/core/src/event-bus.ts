import type { Event } from "./events.js";

export type EventHandler = (event: Event) => void;

export type EventUnsubscribe = () => void;

export interface EventBus {
  publish(event: Event): void;
  subscribe(handler: EventHandler): EventUnsubscribe;
  getEvents(): readonly Event[];
  getEventsByTraceId(traceId: string): readonly Event[];
  clear(): void;
}

export class InMemoryEventBus implements EventBus {
  #events: Event[] = [];
  #handlers = new Set<EventHandler>();

  publish(event: Event): void {
    this.#events.push(event);

    for (const handler of this.#handlers) {
      handler(event);
    }
  }

  subscribe(handler: EventHandler): EventUnsubscribe {
    this.#handlers.add(handler);

    return () => {
      this.#handlers.delete(handler);
    };
  }

  getEvents(): readonly Event[] {
    return this.#events.slice();
  }

  getEventsByTraceId(traceId: string): readonly Event[] {
    return this.#events.filter((event) => event.trace_id === traceId);
  }

  clear(): void {
    this.#events = [];
  }
}
