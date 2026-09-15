import { z } from "zod";
import { isSensitiveKey, redact } from "@dashboard/secrets";
import { hasPermission, type Permission } from "@dashboard/permissions";
import { classifyHttpStatus, IntegrationError } from "./errors";
import type { IntegrationActor, IntegrationCache } from "./types";
import {
  safeActionInFlightKey,
  type SafeActionInFlightGuard,
  type SafeActionRateLimiter,
} from "./action-rate-limiter";

export const SAFE_ACTION_STATUSES = ["success", "accepted", "failed"] as const;
export type SafeActionStatus = (typeof SAFE_ACTION_STATUSES)[number];

export const SAFE_ACTION_NAME_PATTERN = /^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$/u;
export const SAFE_RESOURCE_ID_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/u;

export interface SafeActionResult {
  readonly status: SafeActionStatus;
  readonly action: string;
  readonly resourceId: string;
  readonly occurredAt: string;
}

export const safeActionResultSchema = z.object({
  status: z.enum(SAFE_ACTION_STATUSES),
  action: z.string().min(1).max(64).regex(SAFE_ACTION_NAME_PATTERN),
  resourceId: z.string().min(1).max(128).regex(SAFE_RESOURCE_ID_PATTERN),
  occurredAt: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u),
});

export const safeActionBaseInputSchema = z.object({
  integrationId: z.uuid(),
  expectedConfigRevision: z.number().int().positive().optional(),
});

export interface SafeActionAuditMetadata {
  readonly integrationId: string;
  readonly integrationType: string;
  readonly action: string;
  readonly resourceId: string;
  readonly result: SafeActionStatus;
}

function isActive(actor: IntegrationActor): boolean {
  return Boolean(actor.userId && actor.subject && actor.subject.status === "active");
}

function actorHasAny(actor: IntegrationActor, permissions: readonly Permission[]): boolean {
  if (!actor.subject) return false;
  return permissions.some((permission) => hasPermission(actor.subject!, permission));
}

export function assertSafeActionName(action: string): string {
  if (!SAFE_ACTION_NAME_PATTERN.test(action) || action.length > 64)
    throw new IntegrationError("VALIDATION_ERROR", "Invalid action name");
  return action;
}

export function assertSafeResourceId(resourceId: string): string {
  if (!SAFE_RESOURCE_ID_PATTERN.test(resourceId))
    throw new IntegrationError("VALIDATION_ERROR", "Invalid action resource id");
  return resourceId;
}

export function assertSafeIntegrationActionAccess(
  actor: IntegrationActor,
  actionPermissions: readonly Permission[],
): void {
  if (!isActive(actor)) throw new IntegrationError("UNAUTHORIZED", "Authentication required");
  if (actionPermissions.length === 0)
    throw new IntegrationError("MISCONFIGURED", "Action permissions must be explicit");
  const canInteract = actorHasAny(actor, ["integration.interact", "integration.manage"]);
  const canAct = actorHasAny(actor, actionPermissions);
  if (!canInteract || !canAct) throw new IntegrationError("FORBIDDEN", "Permission denied");
}

export function assertExpectedIntegrationType(loadedType: string, expectedType: string): void {
  if (loadedType !== expectedType)
    throw new IntegrationError("FORBIDDEN", "Unexpected integration type");
}

export function assertFreshConfigRevision(
  currentRevision: number,
  expectedRevision: number | undefined,
): void {
  if (expectedRevision === undefined) return;
  if (currentRevision !== expectedRevision)
    throw new IntegrationError("CONFLICT", "Integration configuration changed");
}

export function createSafeActionResult(input: {
  status: SafeActionStatus;
  action: string;
  resourceId: string;
  occurredAt?: string;
}): SafeActionResult {
  const occurredAt = input.occurredAt ?? new Date().toISOString();
  return safeActionResultSchema.parse({
    status: input.status,
    action: assertSafeActionName(input.action),
    resourceId: assertSafeResourceId(input.resourceId),
    occurredAt,
  });
}

export function safeActionAuditMetadata(input: SafeActionAuditMetadata): SafeActionAuditMetadata {
  assertSafeActionName(input.action);
  assertSafeResourceId(input.resourceId);
  const payload = {
    integrationId: input.integrationId,
    integrationType: input.integrationType,
    action: input.action,
    resourceId: input.resourceId,
    result: input.result,
  };
  const redacted = redact(payload) as Record<string, unknown>;
  for (const key of Object.keys(redacted))
    if (isSensitiveKey(key))
      throw new IntegrationError("INTERNAL_ERROR", "Audit metadata contained a sensitive key");
  return {
    integrationId: String(redacted.integrationId),
    integrationType: String(redacted.integrationType),
    action: String(redacted.action),
    resourceId: String(redacted.resourceId),
    result: input.result,
  };
}

export function throwFromExternalHttpStatus(status: number): never {
  const code = classifyHttpStatus(status);
  if (code === null)
    throw new IntegrationError("INTERNAL_ERROR", "Successful HTTP status is not an action error");
  throw new IntegrationError(code, `External action failed (${status})`);
}

export interface RunSafeIntegrationActionInput {
  readonly actor: IntegrationActor;
  readonly action: string;
  readonly actionPermissions: readonly Permission[];
  readonly integrationId: string;
  readonly expectedType: string;
  readonly loadedType: string;
  readonly resourceId: string;
  readonly rateLimiter: SafeActionRateLimiter;
  readonly inFlight?: SafeActionInFlightGuard;
  readonly cache?: IntegrationCache;
  readonly currentConfigRevision?: number;
  readonly expectedConfigRevision?: number;
  readonly publish?: () => Promise<void>;
  readonly execute: () => Promise<Exclude<SafeActionStatus, "failed"> | SafeActionStatus>;
}

export async function runSafeIntegrationAction(
  input: RunSafeIntegrationActionInput,
): Promise<SafeActionResult> {
  const action = assertSafeActionName(input.action);
  const resourceId = assertSafeResourceId(input.resourceId);
  assertSafeIntegrationActionAccess(input.actor, input.actionPermissions);
  assertExpectedIntegrationType(input.loadedType, input.expectedType);
  if (input.expectedConfigRevision !== undefined && input.currentConfigRevision === undefined)
    throw new IntegrationError("MISCONFIGURED", "Missing current configuration revision");
  assertFreshConfigRevision(input.currentConfigRevision ?? 0, input.expectedConfigRevision);
  const actorId = input.actor.userId ?? "anonymous";
  if (!input.rateLimiter.tryConsume(actorId, input.integrationId, action))
    throw new IntegrationError("RATE_LIMITED", "Too many integration actions");
  const inflightKey = safeActionInFlightKey(actorId, input.integrationId, action, resourceId);
  if (input.inFlight && !input.inFlight.tryEnter(inflightKey))
    throw new IntegrationError("CONFLICT", "Action already in progress");
  try {
    const status = await input.execute();
    const result = createSafeActionResult({ status, action, resourceId });
    switch (result.status) {
      case "failed":
        return result;
      case "success":
      case "accepted":
        input.cache?.invalidate(input.integrationId);
        if (input.publish) {
          try {
            await input.publish();
          } catch (error) {
            void error;
            console.error(JSON.stringify({ msg: "realtime_publish_failed" }));
          }
        }
        return result;
      default: {
        const _exhaustive: never = result.status;
        throw new IntegrationError("INTERNAL_ERROR", String(_exhaustive));
      }
    }
  } finally {
    input.inFlight?.leave(inflightKey);
  }
}
