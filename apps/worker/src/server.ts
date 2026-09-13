import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { MemoryEventBus, type DomainEvent, type EventBus } from "@dashboard/events";

export interface WorkerOptions {
  bus?: EventBus;
  intervalMs?: number;
  now?: () => Date;
}

export interface WorkerHandle {
  readonly bus: EventBus;
  port(): number;
  close(): Promise<void>;
}

const DEFAULT_INTERVAL_MS = 15_000;

function sendJson(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(body));
}

function heartbeat(now: Date): DomainEvent {
  return {
    type: "job.heartbeat",
    jobType: "heartbeat",
    occurredAt: now.toISOString(),
  };
}

export async function startWorker(options: WorkerOptions = {}): Promise<WorkerHandle> {
  const intervalMs = Math.min(60_000, Math.max(5_000, options.intervalMs ?? DEFAULT_INTERVAL_MS));
  const bus = options.bus ?? new MemoryEventBus();
  const now = options.now ?? (() => new Date());
  let lastHeartbeatAt: string | null = null;
  let running = true;

  const server = createServer((request: IncomingMessage, response: ServerResponse) => {
    if (request.method !== "GET") {
      sendJson(response, 405, { status: "error" });
      return;
    }
    if (request.url === "/health/live") {
      sendJson(response, 200, { status: "live" });
      return;
    }
    if (request.url === "/health/ready") {
      sendJson(response, running ? 200 : 503, {
        status: running ? "ready" : "not-ready",
        lastHeartbeatAt,
      });
      return;
    }
    sendJson(response, 404, { status: "not-found" });
  });

  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve());
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("WORKER_BIND_FAILED");

  const tick = async () => {
    try {
      const event = heartbeat(now());
      await bus.publish(event);
      lastHeartbeatAt = event.occurredAt;
    } catch {
      const failed: DomainEvent = {
        type: "job.failed",
        jobType: "heartbeat",
        errorCode: "INTERNAL_ERROR",
        occurredAt: now().toISOString(),
      };
      try {
        await bus.publish(failed);
      } catch {
        void failed;
      }
    }
  };
  await tick();
  const timer = setInterval(() => {
    void tick();
  }, intervalMs);
  timer.unref();

  return {
    bus,
    port() {
      return address.port;
    },
    async close() {
      running = false;
      clearInterval(timer);
      await bus.close();
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    },
  };
}
