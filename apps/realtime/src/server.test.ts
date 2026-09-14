import { describe, expect, it } from "vitest";
import WebSocket from "ws";
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

  it("returns 503 when the configured ready probe fails", async () => {
    const bus = new MemoryEventBus();
    const realtime = await startRealtime({
      bus,
      secret,
      isReady: async () => false,
    });
    try {
      const ready = await readResponse(`http://127.0.0.1:${realtime.port()}/health/ready`);
      expect(ready.status).toBe(503);
      const live = await readResponse(`http://127.0.0.1:${realtime.port()}/health/live`);
      expect(live.status).toBe(200);
    } finally {
      await realtime.close();
    }
  });
});

function wsUrl(port: number, token?: string): string {
  const base = `ws://127.0.0.1:${port}/ws`;
  return token ? `${base}?ticket=${encodeURIComponent(token)}` : base;
}

function upgradeStatus(url: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url);
    socket.once("unexpected-response", (_request, response) => {
      response.resume();
      resolve(response.statusCode ?? 0);
    });
    socket.once("open", () => {
      socket.close();
      resolve(101);
    });
    socket.once("error", (error) => reject(error));
  });
}

function openWs(url: string): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url);
    socket.once("open", () => resolve(socket));
    socket.once("unexpected-response", (_request, response) => {
      response.resume();
      reject(new Error(`upgrade ${response.statusCode}`));
    });
    socket.once("error", reject);
  });
}

async function collectWs(socket: WebSocket, durationMs: number): Promise<string[]> {
  const messages: string[] = [];
  socket.on("message", (data) => {
    messages.push(String(data));
  });
  await new Promise((resolve) => setTimeout(resolve, durationMs));
  return messages;
}

describe("realtime WebSocket", () => {
  it("rejects invalid, expired, and tampered tickets", async () => {
    const bus = new MemoryEventBus();
    const realtime = await startRealtime({ bus, secret, heartbeatMs: 1_000 });
    try {
      expect(await readResponse(`http://127.0.0.1:${realtime.port()}/ws`)).toMatchObject({
        status: 426,
      });
      expect(await upgradeStatus(wsUrl(realtime.port()))).toBe(401);
      const expired = issueRealtimeTicket(
        secret,
        { userId: "user-1", subscriptions: [{ kind: "runtime" }] },
        new Date(Date.now() - 120_000),
      );
      expect(await upgradeStatus(wsUrl(realtime.port(), expired.token))).toBe(401);
      const valid = issueRealtimeTicket(secret, {
        userId: "user-1",
        subscriptions: [{ kind: "runtime" }],
      });
      const tampered = `${valid.token.slice(0, -1)}${valid.token.endsWith("a") ? "b" : "a"}`;
      expect(await upgradeStatus(wsUrl(realtime.port(), tampered))).toBe(401);
    } finally {
      await realtime.close();
    }
  });

  it("filters events by the same ticket RBAC as SSE and ignores unknown types", async () => {
    const bus = new MemoryEventBus();
    const realtime = await startRealtime({ bus, secret, heartbeatMs: 1_000 });
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
        subscriptions: [{ kind: "runtime" }],
      });
      const socketA = await openWs(wsUrl(realtime.port(), userA.token));
      const socketB = await openWs(wsUrl(realtime.port(), userB.token));
      await waitForConnections(() => realtime.connectionCount(), 2);
      const messagesA = collectWs(socketA, 400);
      const messagesB = collectWs(socketB, 400);
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
        type: "integration.data.changed",
        integrationId: "jellyfin-1",
        integrationType: "jellyfin",
        occurredAt: "2026-09-13T00:00:00.000Z",
      });
      await bus.publish({
        type: "integration.data.changed",
        integrationId: "synology-1",
        integrationType: "synology",
        occurredAt: "2026-09-13T00:00:00.000Z",
      });
      await bus.publish({
        type: "job.heartbeat",
        jobType: "heartbeat",
        occurredAt: "2026-09-13T00:00:00.000Z",
      });
      await bus.publish({ type: "unknown.event" } as never);
      const [bodyA, bodyB] = await Promise.all([messagesA, messagesB]);
      expect(bodyA.join("\n")).toContain("board-a");
      expect(bodyA.join("\n")).toContain("jellyfin-1");
      expect(bodyA.join("\n")).not.toContain("board-b");
      expect(bodyA.join("\n")).not.toContain("synology-1");
      expect(bodyA.join("\n")).not.toContain("job.heartbeat");
      expect(bodyA.join("\n")).not.toContain("unknown.event");
      expect(bodyB.join("\n")).toContain("job.heartbeat");
      expect(bodyB.join("\n")).not.toContain("board-a");
      socketA.close();
      socketB.close();
      const drained = Date.now() + 1_000;
      while (Date.now() < drained && realtime.connectionCount() > 0) {
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      const sseTicket = issueRealtimeTicket(secret, {
        userId: "user-c",
        subscriptions: [{ kind: "board", id: "board-a" }],
      });
      const sse = collectSse(
        `http://127.0.0.1:${realtime.port()}/events?ticket=${encodeURIComponent(sseTicket.token)}`,
        400,
      );
      await waitForConnections(() => realtime.connectionCount(), 1);
      await bus.publish({
        type: "board.deleted",
        boardId: "board-a",
        occurredAt: "2026-09-13T00:00:00.000Z",
      });
      const sseBody = await sse;
      expect(sseBody.body).toContain("board.deleted");
    } finally {
      await realtime.close();
    }
  });

  it("limits global and per-user connections and cleans up disconnects", async () => {
    const bus = new MemoryEventBus();
    const realtime = await startRealtime({
      bus,
      secret,
      heartbeatMs: 1_000,
      maxConnections: 2,
      maxConnectionsPerUser: 1,
    });
    try {
      const userA = issueRealtimeTicket(secret, {
        userId: "user-a",
        subscriptions: [{ kind: "runtime" }],
      });
      const userB = issueRealtimeTicket(secret, {
        userId: "user-b",
        subscriptions: [{ kind: "runtime" }],
      });
      const first = await openWs(wsUrl(realtime.port(), userA.token));
      expect(await upgradeStatus(wsUrl(realtime.port(), userA.token))).toBe(429);
      const second = await openWs(wsUrl(realtime.port(), userB.token));
      expect(await upgradeStatus(wsUrl(realtime.port(), userB.token))).toBe(429);
      first.close();
      const deadline = Date.now() + 1_000;
      while (Date.now() < deadline && realtime.connectionCount() > 1) {
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      expect(realtime.connectionCount()).toBe(1);
      second.close();
    } finally {
      await realtime.close();
    }
  });

  it("closes on client messages, oversized frames, and ping timeout", async () => {
    const bus = new MemoryEventBus();
    const realtime = await startRealtime({
      bus,
      secret,
      heartbeatMs: 1_000,
      maxPayloadBytes: 32,
    });
    try {
      const ticket = issueRealtimeTicket(secret, {
        userId: "user-1",
        subscriptions: [{ kind: "runtime" }],
      });
      const command = await openWs(wsUrl(realtime.port(), ticket.token));
      const closedForCommand = new Promise<void>((resolve) =>
        command.once("close", () => resolve()),
      );
      command.send("subscribe");
      await closedForCommand;
      const oversized = await openWs(wsUrl(realtime.port(), ticket.token));
      const closedForSize = new Promise<void>((resolve) =>
        oversized.once("close", () => resolve()),
      );
      oversized.send("x".repeat(64));
      await closedForSize;
      const pinged = await openWs(wsUrl(realtime.port(), ticket.token));
      const sawPing = new Promise<void>((resolve) => pinged.once("ping", () => resolve()));
      await sawPing;
      pinged.close();
    } finally {
      await realtime.close();
    }
  });
});
