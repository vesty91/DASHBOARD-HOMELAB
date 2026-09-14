const LIVE_EVENT_TYPES = [
  "board.updated",
  "board.deleted",
  "integration.updated",
  "integration.deleted",
  "integration.status.changed",
  "integration.data.changed",
] as const;

export function liveSseUrl(token: string): string {
  return `/api/realtime/events?ticket=${encodeURIComponent(token)}`;
}

export function liveWebSocketUrl(token: string): string {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.host}/api/realtime/ws?ticket=${encodeURIComponent(token)}`;
}

export function liveEventKey(type: string): "board" | "integration" {
  return type.startsWith("integration.") ? "integration" : "board";
}

export { LIVE_EVENT_TYPES };
