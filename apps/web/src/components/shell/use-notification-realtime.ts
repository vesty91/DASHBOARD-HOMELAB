"use client";

import { useEffect, useRef } from "react";
import { issueNotificationRealtimeTicketAction } from "@/app/notifications/actions";
import { liveSseUrl, liveWebSocketUrl } from "@/app/boards/live-transport";

const NOTIFICATION_EVENT_TYPES = [
  "notification.created",
  "notification.updated",
  "notification.dismissed",
] as const;

const MAX_BACKOFF_MS = 15_000;
const WS_OPEN_TIMEOUT_MS = 1_500;
/** Stop spinning when realtime is down (e.g. e2e without REALTIME_URL). */
const MAX_FAILURES_BEFORE_OPEN = 3;

function openWebSocket(token: string): Promise<WebSocket | null> {
  return new Promise((resolve) => {
    let settled = false;
    const socket = new WebSocket(liveWebSocketUrl(token));
    const timer = window.setTimeout(() => {
      if (settled) return;
      settled = true;
      socket.close();
      resolve(null);
    }, WS_OPEN_TIMEOUT_MS);
    socket.onopen = () => {
      if (settled) {
        socket.close();
        return;
      }
      settled = true;
      window.clearTimeout(timer);
      resolve(socket);
    };
    socket.onerror = () => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      socket.close();
      resolve(null);
    };
  });
}

export function useNotificationRealtime(enabled: boolean, onEvent: () => void): void {
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  useEffect(() => {
    if (!enabled) return;
    let closed = false;
    let source: EventSource | null = null;
    let socket: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
    let debounceTimer: ReturnType<typeof setTimeout> | undefined;
    let backoffMs = 1_000;
    let everOpened = false;
    let failuresBeforeOpen = 0;

    function emit(): void {
      if (debounceTimer !== undefined) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        onEventRef.current();
      }, 250);
    }

    function markOpened(): void {
      everOpened = true;
      failuresBeforeOpen = 0;
      backoffMs = 1_000;
    }

    function scheduleReconnect(): void {
      if (closed) return;
      if (!everOpened) {
        failuresBeforeOpen += 1;
        if (failuresBeforeOpen >= MAX_FAILURES_BEFORE_OPEN) return;
      }
      const wait = backoffMs + Math.floor(Math.random() * 250);
      backoffMs = Math.min(MAX_BACKOFF_MS, backoffMs * 2);
      if (reconnectTimer !== undefined) clearTimeout(reconnectTimer);
      reconnectTimer = setTimeout(() => {
        void connect();
      }, wait);
    }

    function listenSse(eventSource: EventSource): void {
      for (const type of NOTIFICATION_EVENT_TYPES) {
        eventSource.addEventListener(type, () => {
          emit();
        });
      }
    }

    function attachSse(token: string): void {
      const eventSource = new EventSource(liveSseUrl(token));
      if (closed) {
        eventSource.close();
        return;
      }
      source = eventSource;
      eventSource.onopen = () => {
        markOpened();
      };
      eventSource.onerror = () => {
        eventSource.close();
        if (source === eventSource) source = null;
        scheduleReconnect();
      };
      listenSse(eventSource);
    }

    function attachWs(opened: WebSocket, token: string): void {
      socket = opened;
      opened.onmessage = (event) => {
        if (typeof event.data !== "string") return;
        try {
          const payload = JSON.parse(event.data) as { type?: unknown };
          if (typeof payload.type !== "string") return;
          if (
            payload.type === "notification.created" ||
            payload.type === "notification.updated" ||
            payload.type === "notification.dismissed"
          ) {
            emit();
          }
        } catch {
          return;
        }
      };
      opened.onerror = () => {
        opened.close();
      };
      opened.onclose = () => {
        if (socket === opened) socket = null;
        if (closed) return;
        attachSse(token);
      };
      markOpened();
    }

    async function connect(): Promise<void> {
      if (closed) return;
      const ticket = await issueNotificationRealtimeTicketAction();
      if (closed) return;
      if (!ticket) {
        // Unauthorized / unavailable — do not retry forever (starves other server actions).
        return;
      }
      const opened = await openWebSocket(ticket.token);
      if (closed) {
        opened?.close();
        return;
      }
      if (opened) {
        attachWs(opened, ticket.token);
        return;
      }
      attachSse(ticket.token);
    }

    void connect();
    return () => {
      closed = true;
      if (reconnectTimer !== undefined) clearTimeout(reconnectTimer);
      if (debounceTimer !== undefined) clearTimeout(debounceTimer);
      source?.close();
      socket?.close();
    };
  }, [enabled]);
}
