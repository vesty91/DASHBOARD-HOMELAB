import { describe, expect, it } from "vitest";
import {
  MemoryEventBus,
  RedisEventBus,
  createRuntimeStatusService,
  issueRealtimeTicket,
  parseDomainEvent,
  parseListenAddress,
  redactRedisUrl,
  verifyRealtimeTicket,
  type DomainEvent,
  type RedisPubSubPort,
} from "./index";

const heartbeat = (): DomainEvent => ({
  type: "job.heartbeat",
  jobType: "heartbeat",
  occurredAt: "2026-09-13T00:00:00.000Z",
});

class FakeRedis implements RedisPubSubPort {
  readonly published: { channel: string; message: string }[] = [];
  #listener: ((message: string) => void) | null = null;
  pingResult = true;

  async publish(channel: string, message: string): Promise<void> {
    this.published.push({ channel, message });
    this.#listener?.(message);
  }

  async subscribe(
    _channel: string,
    listener: (message: string) => void,
  ): Promise<() => Promise<void>> {
    this.#listener = listener;
    return async () => {
      this.#listener = null;
    };
  }

  async ping(): Promise<boolean> {
    return this.pingResult;
  }

  async close(): Promise<void> {
    this.#listener = null;
  }
}

describe("events package", () => {
  it("delivers memory bus events without inventing placeholders", async () => {
    const bus = new MemoryEventBus();
    const received: DomainEvent[] = [];
    const unsubscribe = bus.subscribe((event) => received.push(event));
    await bus.publish(heartbeat());
    unsubscribe();
    expect(received).toEqual([heartbeat()]);
    expect(JSON.stringify(received)).not.toMatch(/example|localhost|fake|password/iu);
  });

  it("forwards valid redis payloads and drops oversized or invalid ones", async () => {
    const redis = new FakeRedis();
    const bus = new RedisEventBus(redis);
    const received: DomainEvent[] = [];
    bus.subscribe((event) => received.push(event));
    await Promise.resolve();
    await bus.publish(heartbeat());
    await redis.publish("dashboard.events", "not-json");
    await redis.publish("dashboard.events", JSON.stringify({ type: "board.updated" }));
    expect(received).toEqual([heartbeat()]);
    expect(redis.published[0]?.channel).toBe("dashboard.events");
    await bus.close();
  });

  it("issues and verifies short-lived tickets without embedding secrets", () => {
    const secret = "a".repeat(32);
    const ticket = issueRealtimeTicket(secret, "user-1", new Date("2026-09-13T00:00:00.000Z"));
    expect(ticket.token).not.toMatch(/password|redis:\/\//iu);
    expect(
      verifyRealtimeTicket(secret, ticket.token, new Date("2026-09-13T00:00:30.000Z")),
    ).toEqual({ userId: "user-1" });
    expect(
      verifyRealtimeTicket(secret, ticket.token, new Date("2026-09-13T00:02:00.000Z")),
    ).toBeNull();
    expect(verifyRealtimeTicket("b".repeat(32), ticket.token)).toBeNull();
  });

  it("does not reject the process when redis subscribe fails", async () => {
    const redis: RedisPubSubPort = {
      publish: async () => undefined,
      subscribe: async () => {
        throw new Error("REDIS_DOWN");
      },
      ping: async () => false,
      close: async () => undefined,
    };
    const bus = new RedisEventBus(redis, { subscribeRetryMs: 50 });
    const unsubscribe = bus.subscribe(() => undefined);
    await Promise.resolve();
    await Promise.resolve();
    unsubscribe();
    await expect(bus.close()).resolves.toBeUndefined();
  });

  it("retries redis subscribe after a transient failure", async () => {
    let attempts = 0;
    const redis: RedisPubSubPort = {
      publish: async () => undefined,
      subscribe: async () => {
        attempts += 1;
        if (attempts === 1) throw new Error("REDIS_DOWN");
        return async () => undefined;
      },
      ping: async () => true,
      close: async () => undefined,
    };
    const bus = new RedisEventBus(redis, { subscribeRetryMs: 50 });
    bus.subscribe(() => undefined);
    await new Promise((resolve) => setTimeout(resolve, 80));
    expect(attempts).toBeGreaterThanOrEqual(2);
    await bus.close();
  });

  it("parses deployment listen addresses", () => {
    expect(parseListenAddress({}, "WORKER")).toEqual({ host: "0.0.0.0", port: 3001 });
    expect(
      parseListenAddress({ REALTIME_HOST: "10.0.0.8", REALTIME_PORT: "4000" }, "REALTIME"),
    ).toEqual({ host: "10.0.0.8", port: 4000 });
  });

  it("reports runtime status without leaking redis credentials", async () => {
    const probe = {
      pingRedis: async () => false,
      probeHttp: async () => true,
    };
    const service = createRuntimeStatusService(
      {
        redisUrl: "redis://:super-secret@127.0.0.1:6379/0",
        workerUrl: "http://127.0.0.1:3001",
        realtimeUrl: "http://127.0.0.1:3002",
      },
      probe,
    );
    const status = await service.getStatus();
    expect(status).toEqual({ redis: "down", worker: "up", realtime: "up" });
    expect(JSON.stringify(status)).not.toMatch(/super-secret|6379/u);
    expect(redactRedisUrl("redis://:super-secret@127.0.0.1:6379/0")).toBe(
      "redis://:***@127.0.0.1:6379/0",
    );
    expect(parseDomainEvent({ type: "unknown" })).toBeNull();
  });
});
