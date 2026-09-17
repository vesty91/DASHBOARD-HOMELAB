import type { DomainEvent } from "./events";
import type { RealtimeSubscription } from "./ticket";

export function canReceiveEvent(
  subscriptions: readonly RealtimeSubscription[],
  event: DomainEvent,
  ticketUserId?: string,
): boolean {
  switch (event.type) {
    case "job.heartbeat":
    case "job.failed":
      return subscriptions.some((subscription) => subscription.kind === "runtime");
    case "board.updated":
    case "board.deleted":
      return subscriptions.some(
        (subscription) => subscription.kind === "board" && subscription.id === event.boardId,
      );
    case "integration.updated":
    case "integration.deleted":
    case "integration.status.changed":
    case "integration.data.changed":
      return subscriptions.some(
        (subscription) =>
          subscription.kind === "integration" && subscription.id === event.integrationId,
      );
    case "notification.created":
    case "notification.updated":
    case "notification.dismissed":
      return (
        ticketUserId === event.userId &&
        subscriptions.some((subscription) => subscription.kind === "notifications")
      );
    case "slo.burn-rate.changed":
    case "dependency.impact.changed":
      // Delivered to automation bus subscribers; not a realtime UI subscription yet.
      return false;
    default: {
      const exhaustive: never = event;
      void exhaustive;
      return false;
    }
  }
}
