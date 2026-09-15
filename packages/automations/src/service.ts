import { randomUUID } from "node:crypto";
import { hasPermission, type PermissionSubject } from "@dashboard/permissions";
import { evaluateAutomationOwner, type AutomationOwnerRecord } from "./access";
import {
  assertAutomationActionAllowed,
  getAutomationActionPolicy,
  listAutomationAllowedActions,
} from "./action-registry";
import { AutomationError } from "./errors";
import { evaluateAutomationTrigger, parseAutomationTriggerAndCondition } from "./evaluate";
import {
  parseAutomationEnabledUpdate,
  parseAutomationRuleCreate,
  parseAutomationRuleUpdate,
  type AutomationEnabledUpdateInput,
  type AutomationRuleCreateInput,
  type AutomationRuleUpdateInput,
} from "./schemas";
import type { AutomationActionDispatcher } from "./dispatcher";
import type { AutomationActionType, AutomationTriggerType } from "./types";

export type AutomationActor = {
  userId: string | null;
  subject: PermissionSubject | null;
};

export interface AutomationRuleView {
  id: string;
  name: string;
  description: string | null;
  enabled: boolean;
  ownerUserId: string | null;
  triggerType: AutomationTriggerType;
  triggerConfigJson: Record<string, unknown>;
  conditionConfigJson: Record<string, unknown> | null;
  actionType: AutomationActionType;
  actionConfigJson: Record<string, unknown>;
  cooldownSeconds: number;
  configRevision: number;
  lastEnabledAt: string | null;
  createdAt: string;
  updatedAt: string;
  nextRunAt: string | null;
  lastTriggeredAt: string | null;
  lastCompletedAt: string | null;
  lastRunStatus: string | null;
}

export interface AutomationRunView {
  id: string;
  automationId: string | null;
  runKey: string;
  triggerType: AutomationTriggerType;
  status: string;
  scheduledFor: string | null;
  startedAt: string;
  finishedAt: string | null;
  actionType: AutomationActionType;
  errorCode: string | null;
  resourceId: string | null;
  durationMs: number | null;
}

export type AutomationDryRunOutcome = "would-run" | "would-skip" | "would-deny";

export interface AutomationDryRunResult {
  outcome: AutomationDryRunOutcome;
  reasonCode: string;
}

export interface AutomationRuleStorePort {
  create(input: AutomationRuleCreateInput): Promise<{
    id: string;
    name: string;
    description: string | null;
    enabled: boolean;
    ownerUserId: string | null;
    triggerType: AutomationTriggerType;
    triggerConfigJson: Record<string, unknown>;
    conditionConfigJson: Record<string, unknown> | null;
    actionType: AutomationActionType;
    actionConfigJson: Record<string, unknown>;
    cooldownSeconds: number;
    configRevision: number;
    lastEnabledAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
  }>;
  get(id: string): Promise<{
    id: string;
    name: string;
    description: string | null;
    enabled: boolean;
    ownerUserId: string | null;
    triggerType: AutomationTriggerType;
    triggerConfigJson: Record<string, unknown>;
    conditionConfigJson: Record<string, unknown> | null;
    actionType: AutomationActionType;
    actionConfigJson: Record<string, unknown>;
    cooldownSeconds: number;
    configRevision: number;
    lastEnabledAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
  } | null>;
  list(): Promise<
    Array<{
      id: string;
      name: string;
      description: string | null;
      enabled: boolean;
      ownerUserId: string | null;
      triggerType: AutomationTriggerType;
      triggerConfigJson: Record<string, unknown>;
      conditionConfigJson: Record<string, unknown> | null;
      actionType: AutomationActionType;
      actionConfigJson: Record<string, unknown>;
      cooldownSeconds: number;
      configRevision: number;
      lastEnabledAt: Date | null;
      createdAt: Date;
      updatedAt: Date;
    }>
  >;
  update(
    id: string,
    input: AutomationRuleUpdateInput,
  ): Promise<{
    id: string;
    name: string;
    description: string | null;
    enabled: boolean;
    ownerUserId: string | null;
    triggerType: AutomationTriggerType;
    triggerConfigJson: Record<string, unknown>;
    conditionConfigJson: Record<string, unknown> | null;
    actionType: AutomationActionType;
    actionConfigJson: Record<string, unknown>;
    cooldownSeconds: number;
    configRevision: number;
    lastEnabledAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
  }>;
  setEnabled(
    id: string,
    input: { expectedConfigRevision: number; enabled: boolean },
  ): Promise<{
    id: string;
    name: string;
    description: string | null;
    enabled: boolean;
    ownerUserId: string | null;
    triggerType: AutomationTriggerType;
    triggerConfigJson: Record<string, unknown>;
    conditionConfigJson: Record<string, unknown> | null;
    actionType: AutomationActionType;
    actionConfigJson: Record<string, unknown>;
    cooldownSeconds: number;
    configRevision: number;
    lastEnabledAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
  }>;
  delete(id: string): Promise<void>;
  listRuns(
    automationId: string,
    limit?: number,
  ): Promise<
    Array<{
      id: string;
      automationId: string | null;
      runKey: string;
      triggerType: AutomationTriggerType;
      status: string;
      scheduledFor: Date | null;
      startedAt: Date;
      finishedAt: Date | null;
      actionType: AutomationActionType;
      errorCode: string | null;
      resourceId: string | null;
    }>
  >;
  getRuntime(id: string): Promise<{
    nextRunAt: Date | null;
    lastTriggeredAt: Date | null;
    lastCompletedAt: Date | null;
    lastObservedState: Record<string, unknown> | null;
  } | null>;
  tryInsertRun(input: {
    automationId: string;
    runKey: string;
    triggerType: AutomationTriggerType;
    status: "running";
    startedAt: Date;
    actionType: AutomationActionType;
  }): Promise<{
    created: boolean;
    run: { id: string; status: string };
  }>;
  finishRun(input: {
    runId: string;
    status: "succeeded" | "failed" | "denied" | "skipped" | "unknown";
    finishedAt: Date;
    errorCode?: string | null;
    resourceId?: string | null;
  }): Promise<void>;
}

function requireActive(actor: AutomationActor): asserts actor is AutomationActor & {
  userId: string;
  subject: PermissionSubject;
} {
  if (!actor.userId || !actor.subject || actor.subject.status !== "active")
    throw new AutomationError("FORBIDDEN", "Authentication required");
}

function requirePermission(
  actor: AutomationActor,
  permission: "automation.read" | "automation.manage" | "automation.run",
): void {
  requireActive(actor);
  if (permission === "automation.read") {
    if (
      hasPermission(actor.subject, "automation.read") ||
      hasPermission(actor.subject, "automation.manage")
    )
      return;
    throw new AutomationError("DENIED_PERMISSION", "Permission denied");
  }
  if (!hasPermission(actor.subject, permission))
    throw new AutomationError("DENIED_PERMISSION", "Permission denied");
}

function toIso(value: Date | null | undefined): string | null {
  return value ? value.toISOString() : null;
}

function toRuleView(
  rule: {
    id: string;
    name: string;
    description: string | null;
    enabled: boolean;
    ownerUserId: string | null;
    triggerType: AutomationTriggerType;
    triggerConfigJson: Record<string, unknown>;
    conditionConfigJson: Record<string, unknown> | null;
    actionType: AutomationActionType;
    actionConfigJson: Record<string, unknown>;
    cooldownSeconds: number;
    configRevision: number;
    lastEnabledAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
  },
  runtime: {
    nextRunAt: Date | null;
    lastTriggeredAt: Date | null;
    lastCompletedAt: Date | null;
  } | null,
  lastRunStatus: string | null,
): AutomationRuleView {
  return {
    id: rule.id,
    name: rule.name,
    description: rule.description,
    enabled: rule.enabled,
    ownerUserId: rule.ownerUserId,
    triggerType: rule.triggerType,
    triggerConfigJson: rule.triggerConfigJson,
    conditionConfigJson: rule.conditionConfigJson,
    actionType: rule.actionType,
    actionConfigJson: rule.actionConfigJson,
    cooldownSeconds: rule.cooldownSeconds,
    configRevision: rule.configRevision,
    lastEnabledAt: toIso(rule.lastEnabledAt),
    createdAt: rule.createdAt.toISOString(),
    updatedAt: rule.updatedAt.toISOString(),
    nextRunAt: toIso(runtime?.nextRunAt ?? null),
    lastTriggeredAt: toIso(runtime?.lastTriggeredAt ?? null),
    lastCompletedAt: toIso(runtime?.lastCompletedAt ?? null),
    lastRunStatus,
  };
}

async function assertEnableable(input: {
  rule: {
    ownerUserId: string | null;
    triggerType: AutomationTriggerType;
    triggerConfigJson: Record<string, unknown>;
    conditionConfigJson: Record<string, unknown> | null;
    actionType: AutomationActionType;
    actionConfigJson: Record<string, unknown>;
  };
  loadOwner: (userId: string) => Promise<AutomationOwnerRecord | null>;
  integrationExists: (integrationId: string) => Promise<boolean>;
}): Promise<void> {
  assertAutomationActionAllowed(input.rule.actionType);
  const owner = input.rule.ownerUserId ? await input.loadOwner(input.rule.ownerUserId) : null;
  evaluateAutomationOwner(owner, "run");
  parseAutomationTriggerAndCondition(
    input.rule.triggerType,
    input.rule.triggerConfigJson,
    input.rule.conditionConfigJson,
  );
  const integrationId = input.rule.actionConfigJson.integrationId;
  if (typeof integrationId !== "string" || !(await input.integrationExists(integrationId)))
    throw new AutomationError("VALIDATION_ERROR", "Action integration is missing");
}

export function createAutomationService(deps: {
  store: AutomationRuleStorePort;
  loadOwner: (userId: string) => Promise<AutomationOwnerRecord | null>;
  integrationExists: (integrationId: string) => Promise<boolean>;
  dispatcher?: AutomationActionDispatcher;
  audit?: (event: {
    actorUserId: string | null;
    action:
      | "automation.create"
      | "automation.update"
      | "automation.delete"
      | "automation.enable"
      | "automation.disable";
    targetType: string;
    targetId: string | null;
    outcome: "success" | "failure" | "denied";
    metadata?: Record<string, unknown>;
  }) => Promise<void>;
}) {
  async function hydrate(
    rule: Awaited<ReturnType<AutomationRuleStorePort["get"]>> & object,
  ): Promise<AutomationRuleView> {
    const runtime = await deps.store.getRuntime(rule.id);
    const runs = await deps.store.listRuns(rule.id, 1);
    return toRuleView(rule, runtime, runs[0]?.status ?? null);
  }

  return {
    permissions(actor: AutomationActor) {
      const subject = actor.subject;
      const active = Boolean(subject && subject.status === "active");
      return {
        canRead: Boolean(
          active &&
          subject &&
          (hasPermission(subject, "automation.read") ||
            hasPermission(subject, "automation.manage")),
        ),
        canManage: Boolean(active && subject && hasPermission(subject, "automation.manage")),
        canRun: Boolean(active && subject && hasPermission(subject, "automation.run")),
      };
    },
    catalog(actor: AutomationActor) {
      requirePermission(actor, "automation.read");
      return {
        triggerTypes: ["schedule", "event", "status-transition"] as const,
        actions: listAutomationAllowedActions().map((actionType) =>
          getAutomationActionPolicy(actionType),
        ),
      };
    },
    async list(actor: AutomationActor): Promise<AutomationRuleView[]> {
      requirePermission(actor, "automation.read");
      const rules = await deps.store.list();
      return Promise.all(rules.map((rule) => hydrate(rule)));
    },
    async get(id: string, actor: AutomationActor): Promise<AutomationRuleView> {
      requirePermission(actor, "automation.read");
      const rule = await deps.store.get(id);
      if (!rule) throw new AutomationError("NOT_FOUND", "Automation not found");
      return hydrate(rule);
    },
    async create(
      input: AutomationRuleCreateInput,
      actor: AutomationActor,
    ): Promise<AutomationRuleView> {
      requirePermission(actor, "automation.manage");
      requireActive(actor);
      const parsed = parseAutomationRuleCreate({
        ...input,
        ownerUserId: input.ownerUserId || actor.userId,
      });
      assertAutomationActionAllowed(parsed.actionType);
      const created = await deps.store.create(parsed);
      await deps.audit?.({
        actorUserId: actor.userId,
        action: "automation.create",
        targetType: "automation",
        targetId: created.id,
        outcome: "success",
        metadata: { actionType: created.actionType, triggerType: created.triggerType },
      });
      return hydrate(created);
    },
    async update(
      id: string,
      input: AutomationRuleUpdateInput,
      actor: AutomationActor,
    ): Promise<AutomationRuleView> {
      requirePermission(actor, "automation.manage");
      const existing = await deps.store.get(id);
      if (!existing) throw new AutomationError("NOT_FOUND", "Automation not found");
      const parsed = parseAutomationRuleUpdate(input);
      if (parsed.actionType) assertAutomationActionAllowed(parsed.actionType);
      try {
        const updated = await deps.store.update(id, parsed);
        await deps.audit?.({
          actorUserId: actor.userId,
          action: "automation.update",
          targetType: "automation",
          targetId: id,
          outcome: "success",
          metadata: { configRevision: updated.configRevision },
        });
        return hydrate(updated);
      } catch (error) {
        if (error instanceof AutomationError && error.code === "CONFLICT") throw error;
        throw error;
      }
    },
    async setEnabled(
      id: string,
      input: AutomationEnabledUpdateInput,
      actor: AutomationActor,
    ): Promise<AutomationRuleView> {
      requirePermission(actor, "automation.manage");
      const existing = await deps.store.get(id);
      if (!existing) throw new AutomationError("NOT_FOUND", "Automation not found");
      const parsed = parseAutomationEnabledUpdate(input);
      if (parsed.enabled) {
        await assertEnableable({
          rule: existing,
          loadOwner: deps.loadOwner,
          integrationExists: deps.integrationExists,
        });
      }
      const updated = await deps.store.setEnabled(id, parsed);
      await deps.audit?.({
        actorUserId: actor.userId,
        action: parsed.enabled ? "automation.enable" : "automation.disable",
        targetType: "automation",
        targetId: id,
        outcome: "success",
      });
      return hydrate(updated);
    },
    async delete(id: string, actor: AutomationActor): Promise<void> {
      requirePermission(actor, "automation.manage");
      const existing = await deps.store.get(id);
      if (!existing) throw new AutomationError("NOT_FOUND", "Automation not found");
      await deps.store.delete(id);
      await deps.audit?.({
        actorUserId: actor.userId,
        action: "automation.delete",
        targetType: "automation",
        targetId: id,
        outcome: "success",
      });
    },
    async listRuns(id: string, actor: AutomationActor, limit = 50): Promise<AutomationRunView[]> {
      requirePermission(actor, "automation.read");
      const existing = await deps.store.get(id);
      if (!existing) throw new AutomationError("NOT_FOUND", "Automation not found");
      const runs = await deps.store.listRuns(id, Math.min(100, Math.max(1, limit)));
      return runs.map((run) => ({
        id: run.id,
        automationId: run.automationId,
        runKey: run.runKey,
        triggerType: run.triggerType,
        status: run.status,
        scheduledFor: toIso(run.scheduledFor),
        startedAt: run.startedAt.toISOString(),
        finishedAt: toIso(run.finishedAt),
        actionType: run.actionType,
        errorCode: run.errorCode,
        resourceId: run.resourceId,
        durationMs:
          run.finishedAt != null
            ? Math.max(0, run.finishedAt.getTime() - run.startedAt.getTime())
            : null,
      }));
    },
    async dryRun(id: string, actor: AutomationActor): Promise<AutomationDryRunResult> {
      requirePermission(actor, "automation.run");
      const rule = await deps.store.get(id);
      if (!rule) throw new AutomationError("NOT_FOUND", "Automation not found");
      try {
        assertAutomationActionAllowed(rule.actionType);
      } catch {
        return { outcome: "would-deny", reasonCode: "MANUAL_ONLY" };
      }
      const owner = rule.ownerUserId ? await deps.loadOwner(rule.ownerUserId) : null;
      try {
        evaluateAutomationOwner(owner, "run");
      } catch (error) {
        if (error instanceof AutomationError)
          return { outcome: "would-deny", reasonCode: error.code };
        return { outcome: "would-deny", reasonCode: "DENIED_PERMISSION" };
      }
      const integrationId = rule.actionConfigJson.integrationId;
      if (typeof integrationId !== "string" || !(await deps.integrationExists(integrationId)))
        return { outcome: "would-skip", reasonCode: "NOT_FOUND" };
      const runtime = await deps.store.getRuntime(id);
      if (rule.triggerType === "schedule") {
        const evaluation = evaluateAutomationTrigger({
          automationId: rule.id,
          triggerType: rule.triggerType,
          triggerConfigJson: rule.triggerConfigJson,
          conditionConfigJson: rule.conditionConfigJson,
          cooldownSeconds: rule.cooldownSeconds,
          lastTriggeredAt: runtime?.lastTriggeredAt ?? null,
        });
        if (evaluation.outcome === "skip")
          return {
            outcome: "would-skip",
            reasonCode: evaluation.reason.toUpperCase(),
          };
        return { outcome: "would-run", reasonCode: "OK" };
      }
      return { outcome: "would-run", reasonCode: "OK" };
    },
    async manualRun(id: string, actor: AutomationActor) {
      requirePermission(actor, "automation.run");
      if (!deps.dispatcher)
        throw new AutomationError("VALIDATION_ERROR", "Manual run is unavailable");
      const rule = await deps.store.get(id);
      if (!rule) throw new AutomationError("NOT_FOUND", "Automation not found");
      assertAutomationActionAllowed(rule.actionType);
      const owner = rule.ownerUserId ? await deps.loadOwner(rule.ownerUserId) : null;
      evaluateAutomationOwner(owner, "run");
      const startedAt = new Date();
      const runKey = `${rule.id}:manual:${startedAt.getTime()}:${randomUUID().slice(0, 8)}`;
      const inserted = await deps.store.tryInsertRun({
        automationId: rule.id,
        runKey,
        triggerType: rule.triggerType,
        status: "running",
        startedAt,
        actionType: rule.actionType,
      });
      if (!inserted.created)
        throw new AutomationError("CONFLICT", "Manual run already in progress");
      const result = await deps.dispatcher.dispatch({
        runId: inserted.run.id,
        automationId: rule.id,
        actionType: rule.actionType,
        actionConfigJson: rule.actionConfigJson,
        triggerType: rule.triggerType,
        ownerUserId: rule.ownerUserId,
      });
      await deps.store.finishRun({
        runId: inserted.run.id,
        status: result.status,
        finishedAt: new Date(),
        ...(result.errorCode !== undefined ? { errorCode: result.errorCode } : {}),
        ...(result.resourceId !== undefined ? { resourceId: result.resourceId } : {}),
      });
      return {
        runId: inserted.run.id,
        status: result.status,
        errorCode: result.errorCode ?? null,
        resourceId: result.resourceId ?? null,
      };
    },
  };
}

export type AutomationService = ReturnType<typeof createAutomationService>;
