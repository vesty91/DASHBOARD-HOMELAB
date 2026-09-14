import { describe, expect, it } from "vitest";
import { issueRealtimeTicket, MemoryEventBus } from "@dashboard/events";
import { realtimeOptionsFromEnv } from "./env";
import { startRealtime } from "./server";

const secret = "a".repeat(32);

async function readResponse(url: string): Promise<{ status: number; body: string }> {
  const response = await fetch(url);
  return { status: response.status, body: await response.text() };
}

async function collectSse(
  url: string,
  durationMs: number,
): Promise<{ status: number; body: string }> {
  const stream = await fetch(url);
  const reader = stream.body?.getReader();
  if (!reader) throw new Error("missing body");
  const decoder = new TextDecoder();
  let buffer = "";
  const stop = Date.now() + durationMs;
  while (Date.now() < stop) {
    const remaining = Math.max(1, stop - Date.now());
    const result = await Promise.race([
      reader.read().then((chunk) => ({ kind: "chunk" as const, chunk })),
      new Promise<{ kind: "timeout" }>((resolve) =>
        setTimeout(() => resolve({ kind: "timeout" }), remaining),
      ),
    ]);
    if (result.kind === "timeout") break;
    if (result.chunk.done) break;
    if (result.chunk.value) buffer += decoder.decode(result.chunk.value, { stream: true });
  }
  await reader.cancel();
  return { status: stream.status, body: buffer };
}

async function waitForConnections(count: () => number, expected: number): Promise<void> {
  const deadline = Date.now() + 1_000;
  while (Date.now() < deadline && count() < expected) {
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  expect(count()).toBeGreaterThanOrEqual(expected);
}

describe("realtime SSE", () => {
  it("rejects missing tickets and streams heartbeat events", async () => {
    const bus = new MemoryEventBus();
    const realtime = await startRealtime({ bus, secret, heartbeatMs: 5_000 });
    try {
      const denied = await readResponse(`http://127.0.0.1:${realtime.port()}/events`);
      expect(denied.status).toBe(401);
      const ticket = issueRealtimeTicket(secret, {
        userId: "user-1",
        subscriptions: [{ kind: "runtime" }],
      });
      const stream = collectSse(
        `http://127.0.0.1:${realtime.port()}/events?ticket=${encodeURIComponent(ticket.token)}`,
        400,
      );
      await waitForConnections(() => realtime.connectionCount(), 1);
      await bus.publish({
        type: "job.heartbeat",
        jobType: "heartbeat",
        occurredAt: "2026-09-13T00:00:00.000Z",
      });
      const result = await stream;
      expect(result.status).toBe(200);
      expect(result.body).toContain("event: job.heartbeat");
      expect(result.body).toContain("2026-09-13T00:00:00.000Z");
      expect(result.body).not.toMatch(/AUTH_SECRET|redis:\/\//u);
    } finally {
      await realtime.close();
    }
  });

  it("filters board, integration, and job events by ticket scopes", async () => {
    const bus = new MemoryEventBus();
    const realtime = await startRealtime({ bus, secret, heartbeatMs: 5_000 });
    try {
      const userA = issueRealtimeTicket(secret, {
        userId: "user-a",
        subscriptions: [
          { kind: "board", id: "board-a" },
          { kind: "integration", id: "jellyfin-1" },
        ],
      });
      const userB = issueRealtimeTicket(secret, {
        userId: "user-b",
        subscriptions: [{ kind: "board", id: "board-b" }],
      });
      const streamA = collectSse(
        `http://127.0.0.1:${realtime.port()}/events?ticket=${encodeURIComponent(userA.token)}`,
        500,
      );
      const streamB = collectSse(
        `http://127.0.0.1:${realtime.port()}/events?ticket=${encodeURIComponent(userB.token)}`,
        500,
      );
      await waitForConnections(() => realtime.connectionCount(), 2);
      await bus.publish({
        type: "board.updated",
        boardId: "board-a",
        revision: 2,
        occurredAt: "2026-09-13T00:00:00.000Z",
      });
      await bus.publish({
        type: "board.updated",
        boardId: "board-b",
        revision: 3,
        occurredAt: "2026-09-13T00:00:00.000Z",
      });
      await bus.publish({
        type: "integration.updated",
        integrationId: "jellyfin-1",
        integrationType: "jellyfin",
        occurredAt: "2026-09-13T00:00:00.000Z",
      });
      await bus.publish({
        type: "integration.updated",
        integrationId: "synology-1",
        integrationType: "synology",
        occurredAt: "2026-09-13T00:00:00.000Z",
      });
      await bus.publish({
        type: "job.heartbeat",
        jobType: "heartbeat",
        occurredAt: "2026-09-13T00:00:00.000Z",
      });
      const [bodyA, bodyB] = await Promise.all([streamA, streamB]);
      expect(bodyA.status).toBe(200);
      expect(bodyA.body).toContain("board-a");
      expect(bodyA.body).toContain("jellyfin-1");
      expect(bodyA.body).not.toContain("board-b");
      expect(bodyA.body).not.toContain("synology-1");
      expect(bodyA.body).not.toContain("job.heartbeat");
      expect(bodyB.body).toContain("board-b");
      expect(bodyB.body).not.toContain("board-a");
      expect(bodyB.body).not.toContain("jellyfin-1");
      expect(bodyB.body).not.toContain("job.heartbeat");
    } finally {
      await realtime.close();
    }
  });

  it("reads REDIS_URL, AUTH_SECRET and listen address from process env", () => {
    expect(
      realtimeOptionsFromEnv({
        AUTH_SECRET: secret,
        REDIS_URL: "rediss://redis:6380/0",
        REALTIME_HOST: "0.0.0.0",
        REALTIME_PORT: "3002",
      }),
    ).toEqual({
      secret,
      redisUrl: "rediss://redis:6380/0",
      host: "0.0.0.0",
      port: 3002,
    });
    expect(() => realtimeOptionsFromEnv({ AUTH_SECRET: "short" })).toThrow("AUTH_SECRET_TOO_SHORT");
  });
});
