import {
  canReceiveEvent,
  parseDomainEvent,
  type DomainEvent,
  type RealtimeSubscription,
} from "@dashboard/events";

export function authorizedEvent(
  subscriptions: readonly RealtimeSubscription[],
  raw: unknown,
): DomainEvent | null {
  const event = parseDomainEvent(raw);
  if (!event) return null;
  if (!canReceiveEvent(subscriptions, event)) return null;
  return event;
}
