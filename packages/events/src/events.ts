import { z } from "zod";

export const DOMAIN_EVENT_TYPES = ["job.heartbeat", "job.failed"] as const;
export type DomainEventType = (typeof DOMAIN_EVENT_TYPES)[number];

export const JOB_TYPES = ["heartbeat"] as const;
export type JobType = (typeof JOB_TYPES)[number];

export const JOB_ERROR_CODES = ["REDIS_DOWN", "INTERNAL_ERROR"] as const;
export type JobErrorCode = (typeof JOB_ERROR_CODES)[number];

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
