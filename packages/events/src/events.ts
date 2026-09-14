import { z } from "zod";

export const DOMAIN_EVENT_TYPES = [
  "job.heartbeat",
  "job.failed",
  "board.updated",
  "board.deleted",
  "integration.updated",
  "integration.deleted",
  "integration.status.changed",
  "integration.data.changed",
] as const;
export type DomainEventType = (typeof DOMAIN_EVENT_TYPES)[number];

export const JOB_TYPES = ["heartbeat"] as const;
export type JobType = (typeof JOB_TYPES)[number];

export const JOB_ERROR_CODES = ["REDIS_DOWN", "INTERNAL_ERROR"] as const;
export type JobErrorCode = (typeof JOB_ERROR_CODES)[number];

export const INTEGRATION_EVENT_STATUSES = ["unknown", "available", "unavailable"] as const;
export type IntegrationEventStatus = (typeof INTEGRATION_EVENT_STATUSES)[number];

export const EVENT_RESOURCE_ID = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[A-Za-z0-9_-]+$/u, "Invalid resource id");

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u, "Invalid occurredAt");

export const domainEventSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("job.heartbeat"),
    jobType: z.literal("heartbeat"),
    occurredAt: isoDate,
  }),
  z.object({
    type: z.literal("job.failed"),
    jobType: z.enum(JOB_TYPES),
    errorCode: z.enum(JOB_ERROR_CODES),
    occurredAt: isoDate,
  }),
  z.object({
    type: z.literal("board.updated"),
    boardId: EVENT_RESOURCE_ID,
    revision: z.number().int().positive(),
    occurredAt: isoDate,
  }),
  z.object({
    type: z.literal("board.deleted"),
    boardId: EVENT_RESOURCE_ID,
    occurredAt: isoDate,
  }),
  z.object({
    type: z.literal("integration.updated"),
    integrationId: EVENT_RESOURCE_ID,
    integrationType: z.string().min(1).max(64),
    occurredAt: isoDate,
  }),
  z.object({
    type: z.literal("integration.deleted"),
    integrationId: EVENT_RESOURCE_ID,
    integrationType: z.string().min(1).max(64),
    occurredAt: isoDate,
  }),
  z.object({
    type: z.literal("integration.status.changed"),
    integrationId: EVENT_RESOURCE_ID,
    integrationType: z.string().min(1).max(64),
    status: z.enum(INTEGRATION_EVENT_STATUSES),
    occurredAt: isoDate,
  }),
  z.object({
    type: z.literal("integration.data.changed"),
    integrationId: EVENT_RESOURCE_ID,
    integrationType: z.string().min(1).max(64),
    occurredAt: isoDate,
  }),
]);

export type DomainEvent = z.infer<typeof domainEventSchema>;

export const DOMAIN_EVENT_MAX_BYTES = 8_192;
export const DOMAIN_EVENT_CHANNEL = "dashboard.events";

export function parseDomainEvent(input: unknown): DomainEvent | null {
  const parsed = domainEventSchema.safeParse(input);
  return parsed.success ? parsed.data : null;
}

export function serializeDomainEvent(event: DomainEvent): string {
  return JSON.stringify(event);
}
