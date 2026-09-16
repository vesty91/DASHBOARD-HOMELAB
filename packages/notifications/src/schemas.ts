import { z } from "zod";
import { NotificationError } from "./errors";
import { sanitizeNotificationText } from "./content";
import { assertSafeDestinationPath } from "./destination";
import {
  NOTIFICATION_BODY_MAX,
  NOTIFICATION_CATEGORIES,
  NOTIFICATION_DEDUP_KEY_MAX,
  NOTIFICATION_LIST_DEFAULT_LIMIT,
  NOTIFICATION_LIST_MAX_LIMIT,
  NOTIFICATION_SEVERITIES,
  NOTIFICATION_SOURCE_TYPES,
  NOTIFICATION_TITLE_MAX,
} from "./types";

const uuidSchema = z.uuid();

export const notificationCreateSchema = z
  .object({
    userId: uuidSchema,
    category: z.enum(NOTIFICATION_CATEGORIES),
    severity: z.enum(NOTIFICATION_SEVERITIES),
    title: z.string().min(1).max(NOTIFICATION_TITLE_MAX),
    body: z.string().min(1).max(NOTIFICATION_BODY_MAX),
    sourceType: z.enum(NOTIFICATION_SOURCE_TYPES),
    sourceId: z.string().min(1).max(64).nullable().optional(),
    sourceIntegrationId: uuidSchema.nullable().optional(),
    dedupKey: z
      .string()
      .min(1)
      .max(NOTIFICATION_DEDUP_KEY_MAX)
      .regex(/^[A-Za-z0-9._:-]+$/u)
      .nullable()
      .optional(),
    destinationPath: z.string().min(1).max(256).nullable().optional(),
    expiresAt: z.date().nullable().optional(),
  })
  .strict();

export type NotificationCreateInput = z.infer<typeof notificationCreateSchema>;

export const notificationListQuerySchema = z
  .object({
    limit: z
      .number()
      .int()
      .min(1)
      .max(NOTIFICATION_LIST_MAX_LIMIT)
      .default(NOTIFICATION_LIST_DEFAULT_LIMIT),
    cursor: z.string().min(1).max(200).optional(),
    includeDismissed: z.boolean().default(false),
  })
  .strict();

export type NotificationListQuery = z.infer<typeof notificationListQuerySchema>;

function parseOrThrow<T>(schema: z.ZodType<T>, input: unknown, message: string): T {
  const parsed = schema.safeParse(input);
  if (!parsed.success) throw new NotificationError("VALIDATION_ERROR", message);
  return parsed.data;
}

export function parseNotificationCreate(input: unknown): NotificationCreateInput {
  const parsed = parseOrThrow(notificationCreateSchema, input, "Invalid notification create");
  return {
    ...parsed,
    title: sanitizeNotificationText(parsed.title, "title"),
    body: sanitizeNotificationText(parsed.body, "body"),
    sourceId: parsed.sourceId ?? null,
    sourceIntegrationId: parsed.sourceIntegrationId ?? null,
    dedupKey: parsed.dedupKey ?? null,
    destinationPath: assertSafeDestinationPath(parsed.destinationPath),
    expiresAt: parsed.expiresAt ?? null,
  };
}

export function parseNotificationListQuery(input: unknown): NotificationListQuery {
  return parseOrThrow(notificationListQuerySchema, input, "Invalid notification list query");
}
