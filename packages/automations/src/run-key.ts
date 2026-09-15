import type { DomainEvent } from "@dashboard/events";

const RUN_KEY_MAX = 200;
const RUN_KEY_SAFE = /[^A-Za-z0-9._:-]/gu;

function sanitizeSegment(value: string): string {
  const cleaned = value.replace(RUN_KEY_SAFE, "-").slice(0, 64);
  return cleaned.length > 0 ? cleaned : "x";
}

function clampRunKey(value: string): string {
  return value.slice(0, RUN_KEY_MAX);
}

export function buildScheduleRunKey(automationId: string, scheduledFor: Date): string {
  return clampRunKey(`${automationId}:sch:${scheduledFor.getTime()}`);
}

export function buildStatusDebounceRunKey(
  automationId: string,
  pendingSinceIso: string,
  status: string,
): string {
  return clampRunKey(
    `${automationId}:deb:${sanitizeSegment(pendingSinceIso)}:${sanitizeSegment(status)}`,
  );
}

export function buildEventRunKey(automationId: string, event: DomainEvent): string {
  const prefix = `${automationId}:evt:${sanitizeSegment(event.type)}:${sanitizeSegment(event.occurredAt)}`;
  switch (event.type) {
    case "integration.status.changed":
    case "integration.data.changed":
    case "integration.updated":
    case "integration.deleted":
      return clampRunKey(`${prefix}:${sanitizeSegment(event.integrationId)}`);
    case "job.failed":
    case "job.heartbeat":
      return clampRunKey(`${prefix}:${sanitizeSegment(event.jobType)}`);
    case "board.updated":
    case "board.deleted":
      return clampRunKey(`${prefix}:${sanitizeSegment(event.boardId)}`);
    default: {
      const _never: never = event;
      return _never;
    }
  }
}
