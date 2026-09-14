import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { type Duplex } from "node:stream";
import { WebSocketServer, WebSocket } from "ws";
import {
  createConfiguredEventBus,
  verifyRealtimeTicket,
  type DomainEvent,
  type EventBus,
  type VerifiedRealtimeTicket,
} from "@dashboard/events";
import { authorizedEvent } from "./authorized-event";
import {
  ConnectionLimiter,
  REALTIME_HEARTBEAT_MS,
  REALTIME_MAX_BUFFERED_BYTES,
  REALTIME_MAX_CONNECTIONS,
  REALTIME_MAX_CONNECTIONS_PER_USER,
  REALTIME_MAX_PAYLOAD_BYTES,
  shouldCloseSlowConsumer,
} from "./limits";
import { ticketFromUrl } from "./ticket-from-request";
import { isAllowedRealtimeOrigin } from "./origin";

export {
  REALTIME_HEARTBEAT_MS,
  REALTIME_MAX_BUFFERED_BYTES,
  REALTIME_MAX_CONNECTIONS,
  REALTIME_MAX_CONNECTIONS_PER_USER,
  REALTIME_MAX_PAYLOAD_BYTES,
};

export interface RealtimeOptions {
  bus?: EventBus;
  redisUrl?: string;
  secret: string;
  host?: string;
  port?: number;
  heartbeatMs?: number;
  maxConnections?: number;
  maxConnectionsPerUser?: number;
  maxBufferedBytes?: number;
  maxPayloadBytes?: number;
  isReady?: () => Promise<boolean>;
  allowedOrigin?: string;
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

function writeSse(response: ServerResponse, event: DomainEvent): void {
  response.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
}

function rejectUpgrade(socket: Duplex, status: number, reason: string): void {
  socket.write(`HTTP/1.1 ${status} ${reason}\r\nConnection: close\r\n\r\n`);
  socket.destroy();
}

function busPing(bus: EventBus): Promise<boolean> | null {
  const candidate = bus as EventBus & { ping?: () => Promise<boolean> };
  if (typeof candidate.ping === "function") return candidate.ping();
  return null;
}

export async function startRealtime(options: RealtimeOptions): Promise<RealtimeHandle> {
  const bus = options.bus ?? (await createConfiguredEventBus(options.redisUrl));
  const limiter = new ConnectionLimiter(
    options.maxConnections ?? REALTIME_MAX_CONNECTIONS,
    options.maxConnectionsPerUser ?? REALTIME_MAX_CONNECTIONS_PER_USER,
  );
  const heartbeatMs = Math.min(
    30_000,
    Math.max(1_000, options.heartbeatMs ?? REALTIME_HEARTBEAT_MS),
  );
  const maxBufferedBytes = options.maxBufferedBytes ?? REALTIME_MAX_BUFFERED_BYTES;
  const maxPayloadBytes = options.maxPayloadBytes ?? REALTIME_MAX_PAYLOAD_BYTES;
  const host = options.host ?? "127.0.0.1";
  const port = options.port ?? 0;
  const sseConnections = new Set<ServerResponse>();
  const sockets = new Set<WebSocket>();

  const wss = new WebSocketServer({
    noServer: true,
    maxPayload: maxPayloadBytes,
    clientTracking: false,
  });

  function dispatch(
    ticket: VerifiedRealtimeTicket,
    raw: unknown,
    send: (event: DomainEvent) => void,
  ): void {
    const event = authorizedEvent(ticket.subscriptions, raw);
    if (!event) return;
    send(event);
  }

  function attachSse(
    request: IncomingMessage,
    response: ServerResponse,
    ticket: VerifiedRealtimeTicket,
  ): void {
    sseConnections.add(response);
    const unsubscribe = bus.subscribe((raw) => {
      dispatch(ticket, raw, (event) => writeSse(response, event));
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
    let cleaned = false;
    const cleanup = () => {
      if (cleaned) return;
      cleaned = true;
      clearInterval(ping);
      unsubscribe();
      sseConnections.delete(response);
      limiter.release(ticket.userId);
    };
    request.on("close", cleanup);
    response.on("close", cleanup);
  }

  function attachSocket(socket: WebSocket, ticket: VerifiedRealtimeTicket): void {
    sockets.add(socket);
    socket.binaryType = "arraybuffer";
    let alive = true;
    const unsubscribe = bus.subscribe((raw) => {
      dispatch(ticket, raw, (event) => {
        if (socket.readyState !== WebSocket.OPEN) return;
        if (shouldCloseSlowConsumer(socket.bufferedAmount, maxBufferedBytes)) {
          socket.close();
          return;
        }
        socket.send(JSON.stringify(event));
      });
    });
    const ping = setInterval(() => {
      if (socket.readyState !== WebSocket.OPEN) return;
      if (!alive) {
        socket.terminate();
        return;
      }
      alive = false;
      socket.ping();
    }, heartbeatMs);
    ping.unref();
    socket.on("pong", () => {
      alive = true;
    });
    socket.on("message", () => {
      socket.close();
    });
    let cleaned = false;
    const cleanup = () => {
      if (cleaned) return;
      cleaned = true;
      clearInterval(ping);
      unsubscribe();
      sockets.delete(socket);
      limiter.release(ticket.userId);
    };
    socket.on("close", cleanup);
    socket.on("error", cleanup);
  }

  async function respondReady(response: ServerResponse): Promise<void> {
    try {
      const probe = options.isReady
        ? await options.isReady()
        : options.redisUrl
          ? ((await busPing(bus)) ?? true)
          : true;
      if (!probe) {
        sendJson(response, 503, { status: "not-ready" });
        return;
      }
      sendJson(response, 200, { status: "ready", connections: limiter.size });
    } catch (error) {
      void error;
      sendJson(response, 503, { status: "not-ready" });
    }
  }

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
      void respondReady(response);
      return;
    }
    if (request.url?.startsWith("/ws")) {
      sendJson(response, 426, { status: "upgrade-required" });
      return;
    }
    if (!request.url?.startsWith("/events")) {
      sendJson(response, 404, { status: "not-found" });
      return;
    }
    if (!isAllowedRealtimeOrigin(request.headers.origin, options.allowedOrigin)) {
      sendJson(response, 403, { status: "forbidden-origin" });
      return;
    }
    const ticket = ticketFromUrl(request.url);
    const verified = ticket ? verifyRealtimeTicket(options.secret, ticket) : null;
    if (!verified) {
      sendJson(response, 401, { status: "unauthorized" });
      return;
    }
    if (!limiter.tryAcquire(verified.userId)) {
      sendJson(response, 429, { status: "too-many-connections" });
      return;
    }
    attachSse(request, response, verified);
  });

  server.on("upgrade", (request, socket, head) => {
    if (request.method !== "GET" || !request.url?.startsWith("/ws")) {
      socket.destroy();
      return;
    }
    if (!isAllowedRealtimeOrigin(request.headers.origin, options.allowedOrigin)) {
      rejectUpgrade(socket, 403, "Forbidden");
      return;
    }
    const ticket = ticketFromUrl(request.url);
    const verified = ticket ? verifyRealtimeTicket(options.secret, ticket) : null;
    if (!verified) {
      rejectUpgrade(socket, 401, "Unauthorized");
      return;
    }
    if (
      limiter.size >= limiter.maxGlobal ||
      limiter.countFor(verified.userId) >= limiter.maxPerUser
    ) {
      rejectUpgrade(socket, 429, "Too Many Requests");
      return;
    }
    wss.handleUpgrade(request, socket, head, (websocket) => {
      if (!limiter.tryAcquire(verified.userId)) {
        websocket.close();
        return;
      }
      attachSocket(websocket, verified);
    });
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
      return limiter.size;
    },
    async close() {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
      for (const connection of sseConnections) connection.end();
      sseConnections.clear();
      for (const socket of sockets) socket.terminate();
      sockets.clear();
      wss.close();
      await bus.close();
    },
  };
}
