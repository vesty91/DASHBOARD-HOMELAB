import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { createConfiguredEventBus, type DomainEvent, type EventBus } from "@dashboard/events";

export interface JobRecorder {
  recordHeartbeat(input: {
    occurredAt: Date;
    status: "succeeded" | "failed";
    errorCode?: "INTERNAL_ERROR" | "REDIS_DOWN";
  }): Promise<void>;
}

export interface WorkerOptions {
  bus?: EventBus;
  redisUrl?: string;
  host?: string;
  port?: number;
  intervalMs?: number;
  now?: () => Date;
  jobs?: JobRecorder;
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
  const bus = options.bus ?? (await createConfiguredEventBus(options.redisUrl));
  const now = options.now ?? (() => new Date());
  let lastHeartbeatAt: string | null = null;
  let lastErrorCode: "INTERNAL_ERROR" | null = null;
  let running = true;
  const host = options.host ?? "127.0.0.1";
  const port = options.port ?? 0;

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
      const ready = running && lastErrorCode === null;
      sendJson(response, ready ? 200 : 503, {
        status: ready ? "ready" : "not-ready",
        lastHeartbeatAt,
        lastErrorCode,
      });
      return;
    }
    sendJson(response, 404, { status: "not-found" });
  });

  await new Promise<void>((resolve, reject) => {
    server.listen(port, host, () => resolve());
    server.once("error", reject);
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("WORKER_BIND_FAILED");

  const tick = async () => {
    const occurredAt = now();
    try {
      const event = heartbeat(occurredAt);
      await bus.publish(event);
      if (options.jobs) {
        await options.jobs.recordHeartbeat({ occurredAt, status: "succeeded" });
      }
      lastHeartbeatAt = event.occurredAt;
      lastErrorCode = null;
    } catch {
      lastErrorCode = "INTERNAL_ERROR";
      const failed: DomainEvent = {
        type: "job.failed",
        jobType: "heartbeat",
        errorCode: "INTERNAL_ERROR",
        occurredAt: occurredAt.toISOString(),
      };
      try {
        await bus.publish(failed);
      } catch {
        void failed;
      }
      if (options.jobs) {
        try {
          await options.jobs.recordHeartbeat({
            occurredAt,
            status: "failed",
            errorCode: "INTERNAL_ERROR",
          });
        } catch {
          void occurredAt;
        }
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
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
      await bus.close();
    },
  };
}
