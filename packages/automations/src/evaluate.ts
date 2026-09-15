import { parseDomainEvent, type DomainEvent, type IntegrationEventStatus } from "@dashboard/events";
import { evaluateCondition, parseConditionConfig, type ConditionNode } from "./conditions";
import { AutomationError } from "./errors";
import {
  AUTOMATION_EVENT_TYPES,
  nextScheduleRunAt,
  parseTriggerConfig,
  type AutomationEventType,
  type AutomationStatusValue,
  type ParsedTriggerConfig,
} from "./triggers";
import type { AutomationTriggerType } from "./types";

export type TriggerSkipReason =
  "mismatch" | "condition_false" | "cooldown" | "loop" | "unknown_event";

export type TriggerEvaluation =
  { outcome: "match" } | { outcome: "skip"; reason: TriggerSkipReason };

export interface AutomationTriggerInput {
  automationId: string;
  triggerType: AutomationTriggerType;
  triggerConfigJson: Record<string, unknown>;
  conditionConfigJson?: Record<string, unknown> | null;
  cooldownSeconds: number;
  lastTriggeredAt?: Date | null;
  lastObservedStatus?: AutomationStatusValue | null;
  causationAutomationId?: string | null;
  now?: Date;
  event?: unknown;
}

function inCooldown(
  lastTriggeredAt: Date | null | undefined,
  cooldownSeconds: number,
  now: Date,
): boolean {
  if (!lastTriggeredAt || cooldownSeconds <= 0) return false;
  return now.getTime() - lastTriggeredAt.getTime() < cooldownSeconds * 1000;
}

function eventFields(event: DomainEvent): Record<string, string> | null {
  switch (event.type) {
    case "integration.status.changed":
      return {
        status: event.status,
        integrationType: event.integrationType,
        integrationId: event.integrationId,
      };
    case "integration.data.changed":
      return {
        integrationType: event.integrationType,
        integrationId: event.integrationId,
      };
    case "job.failed":
      return {
        jobType: event.jobType,
        errorCode: event.errorCode,
      };
    case "job.heartbeat":
    case "board.updated":
    case "board.deleted":
    case "integration.updated":
    case "integration.deleted":
      return null;
    default: {
      const _never: never = event;
      return _never;
    }
  }
}

function matchesEventFilters(
  trigger: Extract<ParsedTriggerConfig, { triggerType: "event" }>,
  fields: Record<string, string>,
): boolean {
  if (trigger.config.integrationId && fields.integrationId !== trigger.config.integrationId)
    return false;
  if (trigger.config.integrationType && fields.integrationType !== trigger.config.integrationType)
    return false;
  return true;
}

function matchesStatusTransition(
  trigger: Extract<ParsedTriggerConfig, { triggerType: "status-transition" }>,
  previous: AutomationStatusValue | null | undefined,
  current: IntegrationEventStatus,
  fields: Record<string, string>,
): boolean {
  if (!previous || previous === current) return false;
  if (trigger.config.from !== "*" && trigger.config.from !== previous) return false;
  if (trigger.config.to !== "*" && trigger.config.to !== current) return false;
  if (trigger.config.integrationId && fields.integrationId !== trigger.config.integrationId)
    return false;
  if (trigger.config.integrationType && fields.integrationType !== trigger.config.integrationType)
    return false;
  return true;
}

export function parseAutomationTriggerAndCondition(
  triggerType: AutomationTriggerType,
  triggerConfigJson: unknown,
  conditionConfigJson: unknown,
): { trigger: ParsedTriggerConfig; condition: ConditionNode | null } {
  const trigger = parseTriggerConfig(triggerType, triggerConfigJson);
  const condition = parseConditionConfig(trigger, conditionConfigJson ?? null);
  return { trigger, condition };
}

export function evaluateAutomationTrigger(input: AutomationTriggerInput): TriggerEvaluation {
  const now = input.now ?? new Date();
  if (input.causationAutomationId && input.causationAutomationId === input.automationId)
    return { outcome: "skip", reason: "loop" };
  if (inCooldown(input.lastTriggeredAt, input.cooldownSeconds, now))
    return { outcome: "skip", reason: "cooldown" };

  let trigger: ParsedTriggerConfig;
  let condition: ConditionNode | null;
  try {
    const parsed = parseAutomationTriggerAndCondition(
      input.triggerType,
      input.triggerConfigJson,
      input.conditionConfigJson ?? null,
    );
    trigger = parsed.trigger;
    condition = parsed.condition;
  } catch (error) {
    if (error instanceof AutomationError) return { outcome: "skip", reason: "mismatch" };
    throw error;
  }

  switch (trigger.triggerType) {
    case "schedule":
      if (input.event !== undefined) return { outcome: "skip", reason: "mismatch" };
      return { outcome: "match" };
    case "event": {
      const event = parseDomainEvent(input.event);
      if (!event) return { outcome: "skip", reason: "unknown_event" };
      if (event.type !== trigger.config.eventType) return { outcome: "skip", reason: "mismatch" };
      const fields = eventFields(event);
      if (!fields) return { outcome: "skip", reason: "unknown_event" };
      if (!matchesEventFilters(trigger, fields)) return { outcome: "skip", reason: "mismatch" };
      if (!evaluateCondition(condition, fields))
        return { outcome: "skip", reason: "condition_false" };
      return { outcome: "match" };
    }
    case "status-transition": {
      const event = parseDomainEvent(input.event);
      if (!event) return { outcome: "skip", reason: "unknown_event" };
      if (event.type !== "integration.status.changed")
        return { outcome: "skip", reason: "mismatch" };
      const fields = eventFields(event);
      if (!fields) return { outcome: "skip", reason: "mismatch" };
      if (!matchesStatusTransition(trigger, input.lastObservedStatus, event.status, fields))
        return { outcome: "skip", reason: "mismatch" };
      const conditionFields = {
        ...fields,
        previousStatus: input.lastObservedStatus ?? "",
      };
      if (!evaluateCondition(condition, conditionFields))
        return { outcome: "skip", reason: "condition_false" };
      return { outcome: "match" };
    }
    default: {
      const _never: never = trigger;
      return _never;
    }
  }
}

export function isAutomationEventType(value: string): value is AutomationEventType {
  return (AUTOMATION_EVENT_TYPES as readonly string[]).includes(value);
}

export { nextScheduleRunAt };
