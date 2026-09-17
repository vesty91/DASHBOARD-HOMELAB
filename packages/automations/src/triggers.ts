import { z } from "zod";
import { AutomationError } from "./errors";
import { nextCronOccurrenceUtc, parseFiveFieldCron } from "./cron";
import type { AutomationTriggerType } from "./types";

export const AUTOMATION_EVENT_TYPES = [
  "integration.status.changed",
  "integration.data.changed",
  "job.failed",
  "slo.burn-rate.changed",
  "dependency.impact.changed",
] as const;
export type AutomationEventType = (typeof AUTOMATION_EVENT_TYPES)[number];

export const AUTOMATION_STATUS_VALUES = ["unknown", "available", "unavailable"] as const;
export type AutomationStatusValue = (typeof AUTOMATION_STATUS_VALUES)[number];

export const AUTOMATION_MIN_INTERVAL_MINUTES = 1;
export const AUTOMATION_MAX_INTERVAL_MINUTES = 1_440;
export const AUTOMATION_MIN_STATUS_FOR_DURATION_SECONDS = 0;
export const AUTOMATION_MAX_STATUS_FOR_DURATION_SECONDS = 3_600;

const uuidSchema = z.uuid();

const intervalSchema = z
  .object({
    kind: z.literal("interval"),
    everyMinutes: z
      .number()
      .int()
      .min(AUTOMATION_MIN_INTERVAL_MINUTES)
      .max(AUTOMATION_MAX_INTERVAL_MINUTES),
  })
  .strict();

const intervalShorthandSchema = z
  .object({
    everyMinutes: z
      .number()
      .int()
      .min(AUTOMATION_MIN_INTERVAL_MINUTES)
      .max(AUTOMATION_MAX_INTERVAL_MINUTES),
  })
  .strict();

const cronSchema = z
  .object({
    kind: z.literal("cron"),
    expression: z.string().min(1).max(64),
    timezone: z.literal("UTC").optional(),
  })
  .strict();

const eventSchema = z
  .object({
    eventType: z.enum(AUTOMATION_EVENT_TYPES),
    integrationId: uuidSchema.optional(),
    integrationType: z.string().min(1).max(64).optional(),
  })
  .strict();

const statusTransitionSchema = z
  .object({
    from: z.union([z.literal("*"), z.enum(AUTOMATION_STATUS_VALUES)]),
    to: z.union([z.literal("*"), z.enum(AUTOMATION_STATUS_VALUES)]),
    integrationId: uuidSchema.optional(),
    integrationType: z.string().min(1).max(64).optional(),
    forDurationSeconds: z
      .number()
      .int()
      .min(AUTOMATION_MIN_STATUS_FOR_DURATION_SECONDS)
      .max(AUTOMATION_MAX_STATUS_FOR_DURATION_SECONDS)
      .optional(),
  })
  .strict();

export type ScheduleTriggerConfig =
  | { kind: "interval"; everyMinutes: number }
  | { kind: "cron"; expression: string; timezone: "UTC" };

export type EventTriggerConfig = {
  eventType: AutomationEventType;
  integrationId?: string;
  integrationType?: string;
};

export type StatusTransitionTriggerConfig = {
  from: "*" | AutomationStatusValue;
  to: "*" | AutomationStatusValue;
  integrationId?: string;
  integrationType?: string;
  forDurationSeconds?: number;
};

export type ParsedTriggerConfig =
  | { triggerType: "schedule"; config: ScheduleTriggerConfig }
  | { triggerType: "event"; config: EventTriggerConfig }
  | { triggerType: "status-transition"; config: StatusTransitionTriggerConfig };

function parseOrThrow<T>(schema: z.ZodType<T>, input: unknown, message: string): T {
  const parsed = schema.safeParse(input);
  if (!parsed.success) throw new AutomationError("VALIDATION_ERROR", message);
  return parsed.data;
}

export function parseTriggerConfig(
  triggerType: AutomationTriggerType,
  input: unknown,
): ParsedTriggerConfig {
  switch (triggerType) {
    case "schedule": {
      const interval = intervalSchema.safeParse(input);
      if (interval.success) return { triggerType, config: interval.data };
      const shorthand = intervalShorthandSchema.safeParse(input);
      if (shorthand.success)
        return {
          triggerType,
          config: { kind: "interval", everyMinutes: shorthand.data.everyMinutes },
        };
      const cron = parseOrThrow(cronSchema, input, "Invalid schedule trigger");
      parseFiveFieldCron(cron.expression);
      return {
        triggerType,
        config: { kind: "cron", expression: cron.expression.trim(), timezone: "UTC" },
      };
    }
    case "event": {
      const parsed = parseOrThrow(eventSchema, input, "Invalid event trigger");
      const config: EventTriggerConfig = { eventType: parsed.eventType };
      if (parsed.integrationId) config.integrationId = parsed.integrationId;
      if (parsed.integrationType) config.integrationType = parsed.integrationType;
      return { triggerType, config };
    }
    case "status-transition": {
      const parsed = parseOrThrow(
        statusTransitionSchema,
        input,
        "Invalid status-transition trigger",
      );
      if (parsed.from !== "*" && parsed.to !== "*" && parsed.from === parsed.to)
        throw new AutomationError(
          "VALIDATION_ERROR",
          "status-transition from and to must differ when both are concrete",
        );
      const config: StatusTransitionTriggerConfig = { from: parsed.from, to: parsed.to };
      if (parsed.integrationId) config.integrationId = parsed.integrationId;
      if (parsed.integrationType) config.integrationType = parsed.integrationType;
      if (parsed.forDurationSeconds !== undefined)
        config.forDurationSeconds = parsed.forDurationSeconds;
      return { triggerType, config };
    }
    default: {
      const _never: never = triggerType;
      return _never;
    }
  }
}

export function nextScheduleRunAt(config: ScheduleTriggerConfig, from: Date): Date | null {
  if (config.kind === "interval") return new Date(from.getTime() + config.everyMinutes * 60_000);
  const cron = parseFiveFieldCron(config.expression);
  return nextCronOccurrenceUtc(from, cron);
}
