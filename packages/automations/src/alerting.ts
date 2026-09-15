import type { AutomationRuleCreateInput } from "./schemas";

export const ALERTING_DEFAULT_COOLDOWN_SECONDS = 300;
export const ALERTING_DEFAULT_FOR_DURATION_SECONDS = 60;

export interface IntegrationDownAlertInput {
  name: string;
  description?: string;
  ownerUserId: string;
  watchedIntegrationId: string;
  watchedIntegrationType?: string;
  ntfyIntegrationId: string;
  topic: string;
  message: string;
  title?: string;
  cooldownSeconds?: number;
  forDurationSeconds?: number;
}

export interface IntegrationRecoveryAlertInput {
  name: string;
  description?: string;
  ownerUserId: string;
  watchedIntegrationId: string;
  watchedIntegrationType?: string;
  ntfyIntegrationId: string;
  topic: string;
  message: string;
  title?: string;
  cooldownSeconds?: number;
}

function baseAlert(input: {
  name: string;
  description?: string;
  ownerUserId: string;
  ntfyIntegrationId: string;
  topic: string;
  message: string;
  title?: string;
  cooldownSeconds: number;
}): Pick<
  AutomationRuleCreateInput,
  "name" | "ownerUserId" | "actionType" | "actionConfigJson" | "cooldownSeconds" | "description"
> {
  const actionConfigJson: Record<string, unknown> = {
    integrationId: input.ntfyIntegrationId,
    topic: input.topic,
    message: input.message,
    priority: "high",
  };
  if (input.title) actionConfigJson.title = input.title;
  const result: Pick<
    AutomationRuleCreateInput,
    "name" | "ownerUserId" | "actionType" | "actionConfigJson" | "cooldownSeconds" | "description"
  > = {
    name: input.name,
    ownerUserId: input.ownerUserId,
    actionType: "ntfy.publish",
    actionConfigJson,
    cooldownSeconds: input.cooldownSeconds,
  };
  if (input.description !== undefined) result.description = input.description;
  return result;
}

/** Builds a disabled-by-default DOWN alert (available → unavailable). */
export function buildIntegrationDownAlert(
  input: IntegrationDownAlertInput,
): AutomationRuleCreateInput {
  const forDurationSeconds = input.forDurationSeconds ?? ALERTING_DEFAULT_FOR_DURATION_SECONDS;
  const triggerConfigJson: Record<string, unknown> = {
    from: "available",
    to: "unavailable",
    integrationId: input.watchedIntegrationId,
  };
  if (input.watchedIntegrationType)
    triggerConfigJson.integrationType = input.watchedIntegrationType;
  if (forDurationSeconds > 0) triggerConfigJson.forDurationSeconds = forDurationSeconds;
  return {
    ...baseAlert({
      name: input.name,
      ...(input.description !== undefined ? { description: input.description } : {}),
      ownerUserId: input.ownerUserId,
      ntfyIntegrationId: input.ntfyIntegrationId,
      topic: input.topic,
      message: input.message,
      ...(input.title !== undefined ? { title: input.title } : {}),
      cooldownSeconds: input.cooldownSeconds ?? ALERTING_DEFAULT_COOLDOWN_SECONDS,
    }),
    triggerType: "status-transition",
    triggerConfigJson,
  };
}

/** Builds a disabled-by-default recovery alert (unavailable → available). */
export function buildIntegrationRecoveryAlert(
  input: IntegrationRecoveryAlertInput,
): AutomationRuleCreateInput {
  const triggerConfigJson: Record<string, unknown> = {
    from: "unavailable",
    to: "available",
    integrationId: input.watchedIntegrationId,
  };
  if (input.watchedIntegrationType)
    triggerConfigJson.integrationType = input.watchedIntegrationType;
  return {
    ...baseAlert({
      name: input.name,
      ...(input.description !== undefined ? { description: input.description } : {}),
      ownerUserId: input.ownerUserId,
      ntfyIntegrationId: input.ntfyIntegrationId,
      topic: input.topic,
      message: input.message,
      ...(input.title !== undefined ? { title: input.title } : {}),
      cooldownSeconds: input.cooldownSeconds ?? ALERTING_DEFAULT_COOLDOWN_SECONDS,
    }),
    triggerType: "status-transition",
    triggerConfigJson,
  };
}
