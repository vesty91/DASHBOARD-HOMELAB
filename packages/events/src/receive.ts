import type { DomainEvent } from "./events";
import type { RealtimeSubscription } from "./ticket";

export function canReceiveEvent(
  subscriptions: readonly RealtimeSubscription[],
  event: DomainEvent,
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
      return subscriptions.some(
        (subscription) =>
          subscription.kind === "integration" && subscription.id === event.integrationId,
      );
    default: {
      const exhaustive: never = event;
      void exhaustive;
      return false;
    }
  }
}
