import { z } from "zod";
import { NotificationError } from "./errors";
import { sanitizeNotificationText } from "./content";
import {
  INCIDENT_KINDS,
  INCIDENT_LIST_DEFAULT_LIMIT,
  INCIDENT_LIST_MAX_LIMIT,
  INCIDENT_STATUSES,
  INCIDENT_SUMMARY_MAX,
  INCIDENT_TIMELINE_DEFAULT_LIMIT,
  INCIDENT_TIMELINE_MAX_LIMIT,
} from "./types";

const uuidSchema = z.uuid();

export const incidentListQuerySchema = z
  .object({
    limit: z
      .number()
      .int()
      .min(1)
      .max(INCIDENT_LIST_MAX_LIMIT)
      .default(INCIDENT_LIST_DEFAULT_LIMIT),
    cursor: z.string().min(1).max(200).optional(),
    status: z.enum(INCIDENT_STATUSES).optional(),
    integrationId: uuidSchema.optional(),
    kind: z.enum(INCIDENT_KINDS).optional(),
  })
  .strict();

export type IncidentListQuery = z.infer<typeof incidentListQuerySchema>;

export const incidentTimelineQuerySchema = z
  .object({
    id: uuidSchema,
    limit: z
      .number()
      .int()
      .min(1)
      .max(INCIDENT_TIMELINE_MAX_LIMIT)
      .default(INCIDENT_TIMELINE_DEFAULT_LIMIT),
  })
  .strict();

export type IncidentTimelineQuery = z.infer<typeof incidentTimelineQuerySchema>;

function parseOrThrow<T>(schema: z.ZodType<T>, input: unknown, message: string): T {
  const parsed = schema.safeParse(input);
  if (!parsed.success) throw new NotificationError("VALIDATION_ERROR", message);
  return parsed.data;
}

export function parseIncidentListQuery(input: unknown): IncidentListQuery {
  return parseOrThrow(incidentListQuerySchema, input, "Invalid incident list query");
}

export function parseIncidentTimelineQuery(input: unknown): IncidentTimelineQuery {
  return parseOrThrow(incidentTimelineQuerySchema, input, "Invalid incident timeline query");
}

export function sanitizeIncidentSummary(value: string): string {
  const trimmed = sanitizeNotificationText(
    value.length > INCIDENT_SUMMARY_MAX ? value.slice(0, INCIDENT_SUMMARY_MAX) : value,
    "body",
  );
  return trimmed.slice(0, INCIDENT_SUMMARY_MAX);
}
