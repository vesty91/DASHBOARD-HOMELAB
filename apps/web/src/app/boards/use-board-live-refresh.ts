"use client";

import { useEffect, useRef, useState } from "react";
import { createKeyedDebouncer } from "./live-debounce";
import { shouldRefreshFromLiveEvent } from "./live-event-filter";
import { issueLiveRealtimeTicket } from "./live-ticket-action";
import { LIVE_EVENT_TYPES, liveEventKey, liveSseUrl, liveWebSocketUrl } from "./live-transport";

const LIVE_DEBOUNCE_MS = 400;
const MAX_BACKOFF_MS = 15_000;
const WS_OPEN_TIMEOUT_MS = 1_500;

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

export function useBoardLiveRefresh(input: {
  boardId: string;
  integrationIds: readonly string[];
  onRefresh: () => void;
}): boolean {
  const [live, setLive] = useState(false);
  const onRefreshRef = useRef(input.onRefresh);
  onRefreshRef.current = input.onRefresh;
  const boardId = input.boardId;
  const integrationKey = input.integrationIds.join(",");

  useEffect(() => {
    const integrationIds = integrationKey.length > 0 ? integrationKey.split(",") : [];
    let closed = false;
    let source: EventSource | null = null;
    let socket: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
    let backoffMs = 1_000;
    const debouncer = createKeyedDebouncer(LIVE_DEBOUNCE_MS, () => {
      onRefreshRef.current();
    });

    function applyLiveEvent(type: string, data: string): void {
      if (!shouldRefreshFromLiveEvent(type, data, integrationIds)) return;
      debouncer.trigger(liveEventKey(type));
    }

    function scheduleReconnect(): void {
      if (closed) return;
      setLive(false);
      const wait = backoffMs + Math.floor(Math.random() * 250);
      backoffMs = Math.min(MAX_BACKOFF_MS, backoffMs * 2);
      if (reconnectTimer !== undefined) clearTimeout(reconnectTimer);
      reconnectTimer = setTimeout(() => {
        void connect();
      }, wait);
    }

    function listenSse(eventSource: EventSource): void {
      for (const type of LIVE_EVENT_TYPES) {
        eventSource.addEventListener(type, (event: MessageEvent<string>) => {
          applyLiveEvent(type, event.data);
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
        backoffMs = 1_000;
        setLive(true);
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
          applyLiveEvent(payload.type, event.data);
        } catch {
          return;
        }
      };
      opened.onopen = () => {
        backoffMs = 1_000;
        setLive(true);
      };
      opened.onerror = () => {
        opened.close();
      };
      opened.onclose = () => {
        if (socket === opened) socket = null;
        if (closed) return;
        setLive(false);
        attachSse(token);
      };
      setLive(true);
      backoffMs = 1_000;
    }

    async function connect(): Promise<void> {
      if (closed) return;
      const ticket = await issueLiveRealtimeTicket({
        boardIds: [boardId],
        integrationIds,
      });
      if (closed || !ticket) {
        setLive(false);
        if (!closed) scheduleReconnect();
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
      setLive(false);
      if (reconnectTimer !== undefined) clearTimeout(reconnectTimer);
      source?.close();
      socket?.close();
      debouncer.clear();
    };
  }, [boardId, integrationKey]);

  return live;
}
