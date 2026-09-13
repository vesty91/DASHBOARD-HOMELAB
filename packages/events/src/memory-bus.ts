import type { DomainEvent } from "./events";

export interface EventBus {
  publish(event: DomainEvent): Promise<void>;
  subscribe(listener: (event: DomainEvent) => void): () => void;
  close(): Promise<void>;
}

export const EVENT_BUS_MAX_SUBSCRIBERS = 256;

export class MemoryEventBus implements EventBus {
  readonly #listeners = new Set<(event: DomainEvent) => void>();

  async publish(event: DomainEvent): Promise<void> {
    for (const listener of this.#listeners) listener(event);
  }

  subscribe(listener: (event: DomainEvent) => void): () => void {
    if (this.#listeners.size >= EVENT_BUS_MAX_SUBSCRIBERS) {
      throw new Error("EVENT_BUS_SUBSCRIBER_LIMIT");
    }
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  }

  async close(): Promise<void> {
    this.#listeners.clear();
  }

  get size(): number {
    return this.#listeners.size;
  }
}
