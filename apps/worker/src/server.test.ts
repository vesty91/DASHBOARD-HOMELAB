import { describe, expect, it } from "vitest";
import { MemoryEventBus, type DomainEvent } from "@dashboard/events";
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
});
