"use client";

import { useEffect, useRef, useState } from "react";
import { createKeyedDebouncer } from "./live-debounce";
import { shouldRefreshFromLiveEvent } from "./live-event-filter";
import { issueLiveRealtimeTicket } from "./live-ticket-action";

const LIVE_DEBOUNCE_MS = 400;
const MAX_BACKOFF_MS = 15_000;

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
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
    let backoffMs = 1_000;
    const debouncer = createKeyedDebouncer(LIVE_DEBOUNCE_MS, () => {
      onRefreshRef.current();
    });

    function listen(eventSource: EventSource, type: string, key: string): void {
      eventSource.addEventListener(type, (event: MessageEvent<string>) => {
        if (!shouldRefreshFromLiveEvent(type, event.data, integrationIds)) return;
        debouncer.trigger(key);
      });
    }

    async function connect(): Promise<void> {
      if (closed) return;
      const ticket = await issueLiveRealtimeTicket({
        boardIds: [boardId],
        integrationIds,
      });
      if (closed || !ticket) {
        setLive(false);
        if (!closed) {
          if (reconnectTimer !== undefined) clearTimeout(reconnectTimer);
          reconnectTimer = setTimeout(() => {
            void connect();
          }, backoffMs);
          backoffMs = Math.min(MAX_BACKOFF_MS, backoffMs * 2);
        }
        return;
      }
      const eventSource = new EventSource(
        `/api/realtime/events?ticket=${encodeURIComponent(ticket.token)}`,
      );
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
        setLive(false);
        eventSource.close();
        if (source === eventSource) source = null;
        if (closed) return;
        const wait = backoffMs + Math.floor(Math.random() * 250);
        backoffMs = Math.min(MAX_BACKOFF_MS, backoffMs * 2);
        if (reconnectTimer !== undefined) clearTimeout(reconnectTimer);
        reconnectTimer = setTimeout(() => {
          void connect();
        }, wait);
      };
      listen(eventSource, "board.updated", "board");
      listen(eventSource, "board.deleted", "board");
      listen(eventSource, "integration.updated", "integration");
      listen(eventSource, "integration.deleted", "integration");
      listen(eventSource, "integration.status.changed", "integration");
      listen(eventSource, "integration.data.changed", "integration");
    }

    void connect();
    return () => {
      closed = true;
      setLive(false);
      if (reconnectTimer !== undefined) clearTimeout(reconnectTimer);
      source?.close();
      debouncer.clear();
    };
  }, [boardId, integrationKey]);

  return live;
}
