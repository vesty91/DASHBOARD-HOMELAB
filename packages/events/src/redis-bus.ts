import {
  DOMAIN_EVENT_CHANNEL,
  DOMAIN_EVENT_MAX_BYTES,
  parseDomainEvent,
  serializeDomainEvent,
  type DomainEvent,
} from "./events";
import { EVENT_BUS_MAX_SUBSCRIBERS, type EventBus } from "./memory-bus";

export interface RedisPubSubPort {
  publish(channel: string, message: string): Promise<void>;
  subscribe(channel: string, listener: (message: string) => void): Promise<() => Promise<void>>;
  ping(): Promise<boolean>;
  close(): Promise<void>;
}

export class RedisEventBus implements EventBus {
  readonly #port: RedisPubSubPort;
  readonly #listeners = new Set<(event: DomainEvent) => void>();
  #unsubscribe: (() => Promise<void>) | null = null;
  #connecting: Promise<void> | null = null;

  constructor(port: RedisPubSubPort) {
    this.#port = port;
  }

  async publish(event: DomainEvent): Promise<void> {
    const payload = serializeDomainEvent(event);
    if (Buffer.byteLength(payload, "utf8") > DOMAIN_EVENT_MAX_BYTES) {
      throw new Error("EVENT_TOO_LARGE");
    }
    await this.#port.publish(DOMAIN_EVENT_CHANNEL, payload);
  }

  subscribe(listener: (event: DomainEvent) => void): () => void {
    if (this.#listeners.size >= EVENT_BUS_MAX_SUBSCRIBERS) {
      throw new Error("EVENT_BUS_SUBSCRIBER_LIMIT");
    }
    this.#listeners.add(listener);
    void this.#ensureSubscribed();
    return () => {
      this.#listeners.delete(listener);
    };
  }

  async close(): Promise<void> {
    this.#listeners.clear();
    const unsubscribe = this.#unsubscribe;
    this.#unsubscribe = null;
    if (unsubscribe) await unsubscribe();
    await this.#port.close();
  }

  ping(): Promise<boolean> {
    return this.#port.ping();
  }

  async #ensureSubscribed(): Promise<void> {
    if (this.#unsubscribe) return;
    if (this.#connecting) {
      await this.#connecting;
      return;
    }
    this.#connecting = this.#port
      .subscribe(DOMAIN_EVENT_CHANNEL, (message) => {
        if (Buffer.byteLength(message, "utf8") > DOMAIN_EVENT_MAX_BYTES) return;
        let parsedJson: unknown;
        try {
          parsedJson = JSON.parse(message) as unknown;
        } catch {
          return;
        }
        const event = parseDomainEvent(parsedJson);
        if (!event) return;
        for (const listener of this.#listeners) listener(event);
      })
      .then((unsubscribe) => {
        this.#unsubscribe = unsubscribe;
      })
      .finally(() => {
        this.#connecting = null;
      });
    await this.#connecting;
  }
}
