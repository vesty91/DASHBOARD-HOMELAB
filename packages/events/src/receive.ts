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
    default: {
      const exhaustive: never = event;
      void exhaustive;
      return false;
    }
  }
}
