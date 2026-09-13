import { describe, expect, it } from "vitest";
import { MemoryEventBus, type DomainEvent } from "@dashboard/events";
import { workerOptionsFromEnv } from "./env";
import { startWorker } from "./server";

async function readJson(url: string): Promise<{ status: number; body: unknown }> {
  const response = await fetch(url);
  return { status: response.status, body: (await response.json()) as unknown };
}

describe("worker heartbeat", () => {
  it("publishes a real heartbeat and serves health endpoints", async () => {
    const bus = new MemoryEventBus();
    const received: DomainEvent[] = [];
    bus.subscribe((event) => received.push(event));
    const worker = await startWorker({
      bus,
      intervalMs: 5_000,
      now: () => new Date("2026-09-13T00:00:00.000Z"),
    });
    try {
      const live = await readJson(`http://127.0.0.1:${worker.port()}/health/live`);
      const ready = await readJson(`http://127.0.0.1:${worker.port()}/health/ready`);
      expect(live).toEqual({ status: 200, body: { status: "live" } });
      expect(ready.status).toBe(200);
      expect(ready.body).toEqual({
        status: "ready",
        lastHeartbeatAt: "2026-09-13T00:00:00.000Z",
        lastErrorCode: null,
      });
      expect(received).toEqual([
        {
          type: "job.heartbeat",
          jobType: "heartbeat",
          occurredAt: "2026-09-13T00:00:00.000Z",
        },
      ]);
      expect(JSON.stringify(ready.body)).not.toMatch(/redis:\/\/|password|AUTH_SECRET/iu);
    } finally {
      await worker.close();
    }
  });

  it("marks ready as failed when the heartbeat cannot publish", async () => {
    const bus = {
      publish: async () => {
        throw new Error("REDIS_DOWN");
      },
      subscribe: () => () => undefined,
      close: async () => undefined,
    };
    const worker = await startWorker({ bus, intervalMs: 5_000 });
    try {
      const ready = await readJson(`http://127.0.0.1:${worker.port()}/health/ready`);
      expect(ready.status).toBe(503);
      expect(ready.body).toMatchObject({ status: "not-ready", lastErrorCode: "INTERNAL_ERROR" });
    } finally {
      await worker.close();
    }
  });

  it("reads REDIS_URL and listen address from process env", () => {
    expect(
      workerOptionsFromEnv({
        REDIS_URL: "redis://redis:6379/0",
        WORKER_HOST: "0.0.0.0",
        WORKER_PORT: "3001",
      }),
    ).toEqual({
      redisUrl: "redis://redis:6379/0",
      host: "0.0.0.0",
      port: 3001,
    });
    expect(() => workerOptionsFromEnv({ REDIS_URL: "https://example.test" })).toThrow(
      "INVALID_REDIS_URL",
    );
  });
});
