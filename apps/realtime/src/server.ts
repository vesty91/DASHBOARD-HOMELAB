import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import {
  canReceiveEvent,
  createConfiguredEventBus,
  parseDomainEvent,
  verifyRealtimeTicket,
  type DomainEvent,
  type EventBus,
} from "@dashboard/events";

export const REALTIME_MAX_CONNECTIONS = 100;
export const REALTIME_HEARTBEAT_MS = 15_000;

export interface RealtimeOptions {
  bus?: EventBus;
  redisUrl?: string;
  secret: string;
  host?: string;
  port?: number;
  heartbeatMs?: number;
}

export interface RealtimeHandle {
  readonly bus: EventBus;
  port(): number;
  connectionCount(): number;
  close(): Promise<void>;
}

function sendJson(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(body));
}

function ticketFromUrl(url: string | undefined): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url, "http://realtime.invalid");
    const ticket = parsed.searchParams.get("ticket");
    return ticket && ticket.length > 0 ? ticket : null;
  } catch {
    return null;
  }
}

function writeSse(response: ServerResponse, event: DomainEvent): void {
  response.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
}

export async function startRealtime(options: RealtimeOptions): Promise<RealtimeHandle> {
  const bus = options.bus ?? (await createConfiguredEventBus(options.redisUrl));
  const connections = new Set<ServerResponse>();
  const heartbeatMs = Math.min(
    30_000,
    Math.max(5_000, options.heartbeatMs ?? REALTIME_HEARTBEAT_MS),
  );
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
      sendJson(response, 200, { status: "ready", connections: connections.size });
      return;
    }
    if (!request.url?.startsWith("/events")) {
      sendJson(response, 404, { status: "not-found" });
      return;
    }
    const ticket = ticketFromUrl(request.url);
    const verified = ticket ? verifyRealtimeTicket(options.secret, ticket) : null;
    if (!verified) {
      sendJson(response, 401, { status: "unauthorized" });
      return;
    }
    if (connections.size >= REALTIME_MAX_CONNECTIONS) {
      sendJson(response, 429, { status: "too-many-connections" });
      return;
    }
    connections.add(response);
    const unsubscribe = bus.subscribe((event) => {
      const safe = parseDomainEvent(event);
      if (!safe) return;
      if (!canReceiveEvent(verified.subscriptions, safe)) return;
      writeSse(response, safe);
    });
    response.writeHead(200, {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
    });
    response.write("retry: 5000\n\n");
    const ping = setInterval(() => {
      response.write(": keepalive\n\n");
    }, heartbeatMs);
    ping.unref();
    const cleanup = () => {
      clearInterval(ping);
      unsubscribe();
      connections.delete(response);
    };
    request.on("close", cleanup);
    response.on("close", cleanup);
  });

  await new Promise<void>((resolve, reject) => {
    server.listen(port, host, () => resolve());
    server.once("error", reject);
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("REALTIME_BIND_FAILED");

  return {
    bus,
    port() {
      return address.port;
    },
    connectionCount() {
      return connections.size;
    },
    async close() {
      for (const connection of connections) connection.end();
      connections.clear();
      await bus.close();
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    },
  };
}
