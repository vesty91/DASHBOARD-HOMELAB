import { z } from "zod";
import { AutomationError } from "./errors";
import { assertSafeAutomationJson, assertSafeOptionalAutomationJson } from "./json";
import { parseAutomationTriggerAndCondition } from "./evaluate";
import {
  AUTOMATION_ACTION_TYPES,
  AUTOMATION_COOLDOWN_MAX_SECONDS,
  AUTOMATION_COOLDOWN_MIN_SECONDS,
  AUTOMATION_DESCRIPTION_MAX,
  AUTOMATION_NAME_MAX,
  AUTOMATION_RUN_STATUSES,
  AUTOMATION_TRIGGER_TYPES,
} from "./types";

const uuidSchema = z.uuid();
const jsonObjectSchema = z.record(z.string(), z.unknown());

export const automationRuleCreateSchema = z
  .object({
    name: z.string().trim().min(1).max(AUTOMATION_NAME_MAX),
    description: z.string().trim().max(AUTOMATION_DESCRIPTION_MAX).nullable().optional(),
    ownerUserId: uuidSchema,
    triggerType: z.enum(AUTOMATION_TRIGGER_TYPES),
    triggerConfigJson: jsonObjectSchema,
    conditionConfigJson: jsonObjectSchema.nullable().optional(),
    actionType: z.enum(AUTOMATION_ACTION_TYPES),
    actionConfigJson: jsonObjectSchema,
    cooldownSeconds: z
      .number()
      .int()
      .min(AUTOMATION_COOLDOWN_MIN_SECONDS)
      .max(AUTOMATION_COOLDOWN_MAX_SECONDS)
      .optional(),
  })
  .strict();

export const automationRuleUpdateSchema = z
  .object({
    expectedConfigRevision: z.number().int().positive(),
    name: z.string().trim().min(1).max(AUTOMATION_NAME_MAX).optional(),
    description: z.string().trim().max(AUTOMATION_DESCRIPTION_MAX).nullable().optional(),
    triggerType: z.enum(AUTOMATION_TRIGGER_TYPES).optional(),
    triggerConfigJson: jsonObjectSchema.optional(),
    conditionConfigJson: jsonObjectSchema.nullable().optional(),
    actionType: z.enum(AUTOMATION_ACTION_TYPES).optional(),
    actionConfigJson: jsonObjectSchema.optional(),
    cooldownSeconds: z
      .number()
      .int()
      .min(AUTOMATION_COOLDOWN_MIN_SECONDS)
      .max(AUTOMATION_COOLDOWN_MAX_SECONDS)
      .optional(),
  })
  .strict();

export const automationEnabledUpdateSchema = z
  .object({
    expectedConfigRevision: z.number().int().positive(),
    enabled: z.boolean(),
  })
  .strict();

export const automationRunCreateSchema = z
  .object({
    automationId: uuidSchema.nullable(),
    runKey: z
      .string()
      .min(1)
      .max(200)
      .regex(/^[A-Za-z0-9._:-]+$/u),
    triggerType: z.enum(AUTOMATION_TRIGGER_TYPES),
    status: z.enum(AUTOMATION_RUN_STATUSES),
    scheduledFor: z.date().nullable().optional(),
    startedAt: z.date(),
    finishedAt: z.date().nullable().optional(),
    actionType: z.enum(AUTOMATION_ACTION_TYPES),
    errorCode: z
      .string()
      .regex(/^[A-Z][A-Z0-9_]{1,63}$/u)
      .nullable()
      .optional(),
    resourceId: z
      .string()
      .regex(/^[A-Za-z0-9._:-]{1,128}$/u)
      .nullable()
      .optional(),
    summaryJson: jsonObjectSchema.nullable().optional(),
  })
  .strict();

export type AutomationRuleCreateInput = z.infer<typeof automationRuleCreateSchema>;
export type AutomationRuleUpdateInput = z.infer<typeof automationRuleUpdateSchema>;
export type AutomationEnabledUpdateInput = z.infer<typeof automationEnabledUpdateSchema>;
export type AutomationRunCreateInput = z.infer<typeof automationRunCreateSchema>;

function parseOrThrow<T>(schema: z.ZodType<T>, input: unknown, message: string): T {
  const parsed = schema.safeParse(input);
  if (!parsed.success) throw new AutomationError("VALIDATION_ERROR", message);
  return parsed.data;
}

export function parseAutomationRuleCreate(input: unknown): AutomationRuleCreateInput {
  const parsed = parseOrThrow(automationRuleCreateSchema, input, "Invalid automation rule");
  assertSafeAutomationJson(parsed.triggerConfigJson, "triggerConfigJson");
  assertSafeOptionalAutomationJson(parsed.conditionConfigJson ?? null, "conditionConfigJson");
  parseAutomationTriggerAndCondition(
    parsed.triggerType,
    parsed.triggerConfigJson,
    parsed.conditionConfigJson ?? null,
  );
  const actionConfig = assertSafeAutomationJson(parsed.actionConfigJson, "actionConfigJson");
  const integrationId = actionConfig.integrationId;
  if (typeof integrationId !== "string" || !z.uuid().safeParse(integrationId).success)
    throw new AutomationError("VALIDATION_ERROR", "actionConfigJson.integrationId must be a UUID");
  return parsed;
}

export function parseAutomationRuleUpdate(input: unknown): AutomationRuleUpdateInput {
  const parsed = parseOrThrow(automationRuleUpdateSchema, input, "Invalid automation update");
  if (parsed.triggerConfigJson)
    assertSafeAutomationJson(parsed.triggerConfigJson, "triggerConfigJson");
  if (parsed.conditionConfigJson !== undefined)
    assertSafeOptionalAutomationJson(parsed.conditionConfigJson, "conditionConfigJson");
  if (
    parsed.triggerType !== undefined ||
    parsed.triggerConfigJson !== undefined ||
    parsed.conditionConfigJson !== undefined
  ) {
    if (!parsed.triggerType || !parsed.triggerConfigJson)
      throw new AutomationError(
        "VALIDATION_ERROR",
        "triggerType and triggerConfigJson are required to update trigger or condition",
      );
    parseAutomationTriggerAndCondition(
      parsed.triggerType,
      parsed.triggerConfigJson,
      parsed.conditionConfigJson ?? null,
    );
  }
  if (parsed.actionConfigJson) {
    const actionConfig = assertSafeAutomationJson(parsed.actionConfigJson, "actionConfigJson");
    const integrationId = actionConfig.integrationId;
    if (typeof integrationId !== "string" || !z.uuid().safeParse(integrationId).success)
      throw new AutomationError(
        "VALIDATION_ERROR",
        "actionConfigJson.integrationId must be a UUID",
      );
  }
  return parsed;
}

export function parseAutomationEnabledUpdate(input: unknown): AutomationEnabledUpdateInput {
  return parseOrThrow(automationEnabledUpdateSchema, input, "Invalid automation enablement");
}

export function parseAutomationRunCreate(input: unknown): AutomationRunCreateInput {
  const parsed = parseOrThrow(automationRunCreateSchema, input, "Invalid automation run");
  if (parsed.summaryJson) assertSafeAutomationJson(parsed.summaryJson, "summaryJson", 2_048);
  return parsed;
}
