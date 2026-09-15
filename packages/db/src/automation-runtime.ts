import { randomUUID } from "node:crypto";
import { and, desc, eq, lt, sql } from "drizzle-orm";
import {
  AutomationError,
  AUTOMATION_RUN_MAX_PER_RULE,
  AUTOMATION_RUN_RETENTION_MS,
  nextScheduleRunAt,
  parseAutomationEnabledUpdate,
  parseAutomationRuleCreate,
  parseAutomationRuleUpdate,
  parseAutomationRunCreate,
  parseTriggerConfig,
  type AutomationActionType,
  type AutomationRuleCreateInput,
  type AutomationRuleUpdateInput,
  type AutomationRunCreateInput,
  type AutomationRunStatus,
  type AutomationTriggerType,
} from "@dashboard/automations";
import { normalizeDatabaseError } from "./errors";
import type { PostgresqlClient } from "./client/postgresql";
import type { SqliteClient } from "./client/sqlite";
import * as postgresqlSchema from "./schema/postgresql";
import * as sqliteSchema from "./schema/sqlite";

export interface AutomationRuleRecord {
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
}

export interface AutomationRunRecord {
  id: string;
  automationId: string | null;
  runKey: string;
  triggerType: AutomationTriggerType;
  status: AutomationRunStatus;
  scheduledFor: Date | null;
  startedAt: Date;
  finishedAt: Date | null;
  actionType: AutomationActionType;
  errorCode: string | null;
  resourceId: string | null;
  summaryJson: Record<string, unknown> | null;
  createdAt: Date;
}

export interface AutomationRuntimeStateRecord {
  automationId: string;
  nextRunAt: Date | null;
  lastTriggeredAt: Date | null;
  lastCompletedAt: Date | null;
  lastObservedState: Record<string, unknown> | null;
  failureCount: number;
  leaseOwner: string | null;
  leaseUntil: Date | null;
}

export interface AutomationLeaseClaimInput {
  automationId: string;
  workerId: string;
  now: Date;
  leaseUntil: Date;
}

export interface AutomationRuntimePatch {
  nextRunAt?: Date | null;
  lastTriggeredAt?: Date | null;
  lastCompletedAt?: Date | null;
  lastObservedState?: Record<string, unknown> | null;
  failureCount?: number;
}

export interface AutomationStore {
  create(input: AutomationRuleCreateInput): Promise<AutomationRuleRecord>;
  get(id: string): Promise<AutomationRuleRecord | null>;
  list(): Promise<AutomationRuleRecord[]>;
  update(id: string, input: AutomationRuleUpdateInput): Promise<AutomationRuleRecord>;
  setEnabled(
    id: string,
    input: { expectedConfigRevision: number; enabled: boolean },
  ): Promise<AutomationRuleRecord>;
  delete(id: string): Promise<void>;
  recordRun(input: AutomationRunCreateInput): Promise<AutomationRunRecord>;
  tryInsertRun(
    input: AutomationRunCreateInput,
  ): Promise<{ run: AutomationRunRecord; created: boolean }>;
  getRunByKey(runKey: string): Promise<AutomationRunRecord | null>;
  listRuns(automationId: string, limit?: number): Promise<AutomationRunRecord[]>;
  purgeHistory(now?: Date): Promise<number>;
  getRuntime(id: string): Promise<AutomationRuntimeStateRecord | null>;
  listDueScheduleIds(now: Date, limit: number): Promise<string[]>;
  listDueStatusDebounceIds(now: Date, limit: number): Promise<string[]>;
  listUnscheduledScheduleIds(limit: number): Promise<string[]>;
  listEnabledEventRuleIds(limit: number): Promise<string[]>;
  claimLease(input: AutomationLeaseClaimInput): Promise<boolean>;
  releaseLease(input: { automationId: string; workerId: string }): Promise<void>;
  updateRuntime(automationId: string, patch: AutomationRuntimePatch): Promise<void>;
  finishRun(input: {
    runId: string;
    status: AutomationRunStatus;
    finishedAt: Date;
    errorCode?: string | null;
    resourceId?: string | null;
    summaryJson?: Record<string, unknown> | null;
  }): Promise<void>;
  markStaleRunsUnknown(now: Date, olderThanMs: number): Promise<number>;
}

function readJsonObject(value: unknown): Record<string, unknown> {
  if (value == null) return {};
  if (typeof value === "string") return JSON.parse(value) as Record<string, unknown>;
  if (typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  return {};
}

function readJsonObjectOrNull(value: unknown): Record<string, unknown> | null {
  if (value == null) return null;
  return readJsonObject(value);
}

function toRule(row: {
  id: string;
  name: string;
  description: string | null;
  enabled: boolean;
  ownerUserId: string | null;
  triggerType: string;
  triggerConfigJson: unknown;
  conditionConfigJson: unknown;
  actionType: string;
  actionConfigJson: unknown;
  cooldownSeconds: number;
  configRevision: number;
  lastEnabledAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}): AutomationRuleRecord {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    enabled: row.enabled,
    ownerUserId: row.ownerUserId,
    triggerType: row.triggerType as AutomationTriggerType,
    triggerConfigJson: readJsonObject(row.triggerConfigJson),
    conditionConfigJson: readJsonObjectOrNull(row.conditionConfigJson),
    actionType: row.actionType as AutomationActionType,
    actionConfigJson: readJsonObject(row.actionConfigJson),
    cooldownSeconds: row.cooldownSeconds,
    configRevision: row.configRevision,
    lastEnabledAt: row.lastEnabledAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toRun(row: {
  id: string;
  automationId: string | null;
  runKey: string;
  triggerType: string;
  status: string;
  scheduledFor: Date | null;
  startedAt: Date;
  finishedAt: Date | null;
  actionType: string;
  errorCode: string | null;
  resourceId: string | null;
  summaryJson: unknown;
  createdAt: Date;
}): AutomationRunRecord {
  return {
    id: row.id,
    automationId: row.automationId,
    runKey: row.runKey,
    triggerType: row.triggerType as AutomationTriggerType,
    status: row.status as AutomationRunStatus,
    scheduledFor: row.scheduledFor,
    startedAt: row.startedAt,
    finishedAt: row.finishedAt,
    actionType: row.actionType as AutomationActionType,
    errorCode: row.errorCode,
    resourceId: row.resourceId,
    summaryJson: readJsonObjectOrNull(row.summaryJson),
    createdAt: row.createdAt,
  };
}

function readObservedState(value: unknown): Record<string, unknown> | null {
  if (value == null) return null;
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed))
        return parsed as Record<string, unknown>;
    } catch {
      return { status: value };
    }
    return { status: value };
  }
  if (typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  return null;
}

function toRuntime(row: {
  automationId: string;
  nextRunAt: Date | null;
  lastTriggeredAt: Date | null;
  lastCompletedAt: Date | null;
  lastObservedState: unknown;
  failureCount: number;
  leaseOwner: string | null;
  leaseUntil: Date | null;
}): AutomationRuntimeStateRecord {
  return {
    automationId: row.automationId,
    nextRunAt: row.nextRunAt,
    lastTriggeredAt: row.lastTriggeredAt,
    lastCompletedAt: row.lastCompletedAt,
    lastObservedState: readObservedState(row.lastObservedState),
    failureCount: row.failureCount,
    leaseOwner: row.leaseOwner,
    leaseUntil: row.leaseUntil,
  };
}

function nextRunAtForEnable(
  rule: Pick<AutomationRuleRecord, "triggerType" | "triggerConfigJson">,
  now: Date,
): Date | null {
  if (rule.triggerType !== "schedule") return null;
  try {
    const parsed = parseTriggerConfig(rule.triggerType, rule.triggerConfigJson);
    if (parsed.triggerType !== "schedule") return null;
    return nextScheduleRunAt(parsed.config, now);
  } catch {
    return new Date(now.getTime() + 60_000);
  }
}

async function assertRevisionOrThrow(exists: boolean, changed: boolean): Promise<void> {
  if (changed) return;
  if (exists) throw new AutomationError("CONFLICT", "Automation configuration changed");
  throw new AutomationError("NOT_FOUND", "Automation not found");
}

export function createSqliteAutomationStore(client: SqliteClient): AutomationStore {
  const { db } = client;
  const rules = sqliteSchema.automationRules;
  const state = sqliteSchema.automationRuntimeState;
  const runs = sqliteSchema.automationRuns;

  async function load(id: string): Promise<AutomationRuleRecord | null> {
    const found = await db.select().from(rules).where(eq(rules.id, id)).get();
    if (!found?.id) return null;
    return toRule({
      ...found,
      description: found.description ?? null,
      ownerUserId: found.ownerUserId ?? null,
      lastEnabledAt: found.lastEnabledAt ?? null,
      conditionConfigJson: found.conditionConfigJson ?? null,
    });
  }

  return {
    async create(input) {
      const parsed = parseAutomationRuleCreate(input);
      const now = new Date();
      const id = randomUUID();
      await db
        .insert(rules)
        .values({
          id,
          name: parsed.name,
          description: parsed.description ?? null,
          enabled: false,
          ownerUserId: parsed.ownerUserId,
          triggerType: parsed.triggerType,
          triggerConfigJson: JSON.stringify(parsed.triggerConfigJson),
          conditionConfigJson: parsed.conditionConfigJson
            ? JSON.stringify(parsed.conditionConfigJson)
            : null,
          actionType: parsed.actionType,
          actionConfigJson: JSON.stringify(parsed.actionConfigJson),
          cooldownSeconds: parsed.cooldownSeconds ?? 60,
          configRevision: 1,
          createdAt: now,
          updatedAt: now,
        })
        .run();
      await db.insert(state).values({ automationId: id, failureCount: 0 }).run();
      const created = await load(id);
      if (!created) throw new AutomationError("NOT_FOUND", "Automation not found");
      return created;
    },
    get: load,
    async list() {
      const rows = await db.select().from(rules).orderBy(rules.name).all();
      return rows.map((found) =>
        toRule({
          ...found,
          description: found.description ?? null,
          ownerUserId: found.ownerUserId ?? null,
          lastEnabledAt: found.lastEnabledAt ?? null,
          conditionConfigJson: found.conditionConfigJson ?? null,
        }),
      );
    },
    async update(id, input) {
      const parsed = parseAutomationRuleUpdate(input);
      const existing = await load(id);
      if (!existing) throw new AutomationError("NOT_FOUND", "Automation not found");
      const now = new Date();
      await db
        .update(rules)
        .set({
          ...(parsed.name !== undefined ? { name: parsed.name } : {}),
          ...(parsed.description !== undefined ? { description: parsed.description } : {}),
          ...(parsed.triggerType !== undefined ? { triggerType: parsed.triggerType } : {}),
          ...(parsed.triggerConfigJson
            ? { triggerConfigJson: JSON.stringify(parsed.triggerConfigJson) }
            : {}),
          ...(parsed.conditionConfigJson !== undefined
            ? {
                conditionConfigJson: parsed.conditionConfigJson
                  ? JSON.stringify(parsed.conditionConfigJson)
                  : null,
              }
            : {}),
          ...(parsed.actionType !== undefined ? { actionType: parsed.actionType } : {}),
          ...(parsed.actionConfigJson
            ? { actionConfigJson: JSON.stringify(parsed.actionConfigJson) }
            : {}),
          ...(parsed.cooldownSeconds !== undefined
            ? { cooldownSeconds: parsed.cooldownSeconds }
            : {}),
          configRevision: existing.configRevision + 1,
          updatedAt: now,
        })
        .where(and(eq(rules.id, id), eq(rules.configRevision, parsed.expectedConfigRevision)))
        .run();
      const updated = await load(id);
      if (!updated) throw new AutomationError("NOT_FOUND", "Automation not found");
      await assertRevisionOrThrow(true, updated.configRevision === existing.configRevision + 1);
      return updated;
    },
    async setEnabled(id, input) {
      const parsed = parseAutomationEnabledUpdate(input);
      const existing = await load(id);
      if (!existing) throw new AutomationError("NOT_FOUND", "Automation not found");
      const now = new Date();
      await db
        .update(rules)
        .set({
          enabled: parsed.enabled,
          lastEnabledAt: parsed.enabled ? now : existing.lastEnabledAt,
          configRevision: existing.configRevision + 1,
          updatedAt: now,
        })
        .where(and(eq(rules.id, id), eq(rules.configRevision, parsed.expectedConfigRevision)))
        .run();
      const updated = await load(id);
      if (!updated) throw new AutomationError("NOT_FOUND", "Automation not found");
      await assertRevisionOrThrow(true, updated.configRevision === existing.configRevision + 1);
      if (parsed.enabled) {
        await db
          .update(state)
          .set({
            nextRunAt: nextRunAtForEnable(updated, now),
            leaseOwner: null,
            leaseUntil: null,
          })
          .where(eq(state.automationId, id))
          .run();
      } else {
        await db
          .update(state)
          .set({
            nextRunAt: null,
            leaseOwner: null,
            leaseUntil: null,
          })
          .where(eq(state.automationId, id))
          .run();
      }
      return updated;
    },
    async delete(id) {
      const existing = await load(id);
      if (!existing) throw new AutomationError("NOT_FOUND", "Automation not found");
      await db.delete(rules).where(eq(rules.id, id)).run();
    },
    async recordRun(input) {
      const parsed = parseAutomationRunCreate(input);
      const now = new Date();
      const id = randomUUID();
      await db
        .insert(runs)
        .values({
          id,
          automationId: parsed.automationId,
          runKey: parsed.runKey,
          triggerType: parsed.triggerType,
          status: parsed.status,
          scheduledFor: parsed.scheduledFor ?? null,
          startedAt: parsed.startedAt,
          finishedAt: parsed.finishedAt ?? null,
          actionType: parsed.actionType,
          errorCode: parsed.errorCode ?? null,
          resourceId: parsed.resourceId ?? null,
          summaryJson: parsed.summaryJson ? JSON.stringify(parsed.summaryJson) : null,
          createdAt: now,
        })
        .run();
      const found = await db.select().from(runs).where(eq(runs.id, id)).get();
      if (!found?.id) throw new AutomationError("NOT_FOUND", "Automation run not found");
      return toRun({
        ...found,
        automationId: found.automationId ?? null,
        scheduledFor: found.scheduledFor ?? null,
        finishedAt: found.finishedAt ?? null,
        errorCode: found.errorCode ?? null,
        resourceId: found.resourceId ?? null,
        summaryJson: found.summaryJson ?? null,
      });
    },
    async listRuns(automationId, limit = 50) {
      const rows = await db
        .select()
        .from(runs)
        .where(eq(runs.automationId, automationId))
        .orderBy(desc(runs.startedAt))
        .limit(Math.min(100, Math.max(1, limit)))
        .all();
      return rows.map((found) =>
        toRun({
          ...found,
          automationId: found.automationId ?? null,
          scheduledFor: found.scheduledFor ?? null,
          finishedAt: found.finishedAt ?? null,
          errorCode: found.errorCode ?? null,
          resourceId: found.resourceId ?? null,
          summaryJson: found.summaryJson ?? null,
        }),
      );
    },
    async purgeHistory(now = new Date()) {
      const cutoff = now.getTime() - AUTOMATION_RUN_RETENTION_MS;
      const expired = client.sqlite
        .prepare("DELETE FROM automation_runs WHERE finished_at IS NOT NULL AND finished_at < ?")
        .run(cutoff);
      const extras = client.sqlite
        .prepare(
          `DELETE FROM automation_runs
           WHERE id IN (
             SELECT id FROM (
               SELECT id, ROW_NUMBER() OVER (
                 PARTITION BY automation_id ORDER BY started_at DESC
               ) AS rn
               FROM automation_runs
               WHERE automation_id IS NOT NULL
             )
             WHERE rn > ?
           )`,
        )
        .run(AUTOMATION_RUN_MAX_PER_RULE);
      return Number(expired.changes) + Number(extras.changes);
    },
    async tryInsertRun(input) {
      try {
        return { run: await this.recordRun(input), created: true };
      } catch (error) {
        const normalized = normalizeDatabaseError(error);
        if (normalized.code !== "UNIQUE_CONSTRAINT") throw error;
        const existing = await this.getRunByKey(input.runKey);
        if (!existing) throw error;
        return { run: existing, created: false };
      }
    },
    async getRunByKey(runKey) {
      const found = await db.select().from(runs).where(eq(runs.runKey, runKey)).get();
      if (!found?.id) return null;
      return toRun({
        ...found,
        automationId: found.automationId ?? null,
        scheduledFor: found.scheduledFor ?? null,
        finishedAt: found.finishedAt ?? null,
        errorCode: found.errorCode ?? null,
        resourceId: found.resourceId ?? null,
        summaryJson: found.summaryJson ?? null,
      });
    },
    async getRuntime(id) {
      const found = await db.select().from(state).where(eq(state.automationId, id)).get();
      if (!found?.automationId) return null;
      return toRuntime({
        ...found,
        nextRunAt: found.nextRunAt ?? null,
        lastTriggeredAt: found.lastTriggeredAt ?? null,
        lastCompletedAt: found.lastCompletedAt ?? null,
        lastObservedState: found.lastObservedState ?? null,
        leaseOwner: found.leaseOwner ?? null,
        leaseUntil: found.leaseUntil ?? null,
      });
    },
    async listDueScheduleIds(now, limit) {
      const rows = client.sqlite
        .prepare(
          `SELECT r.id AS id
           FROM automation_rules r
           INNER JOIN automation_runtime_state s ON s.automation_id = r.id
           WHERE r.enabled = 1
             AND r.trigger_type = 'schedule'
             AND s.next_run_at IS NOT NULL
             AND s.next_run_at <= ?
             AND (s.lease_until IS NULL OR s.lease_until < ?)
           ORDER BY s.next_run_at ASC
           LIMIT ?`,
        )
        .all(now.getTime(), now.getTime(), Math.min(100, Math.max(1, limit))) as { id: string }[];
      return rows.map((row) => row.id);
    },
    async listDueStatusDebounceIds(now, limit) {
      const rows = client.sqlite
        .prepare(
          `SELECT r.id AS id
           FROM automation_rules r
           INNER JOIN automation_runtime_state s ON s.automation_id = r.id
           WHERE r.enabled = 1
             AND r.trigger_type = 'status-transition'
             AND s.next_run_at IS NOT NULL
             AND s.next_run_at <= ?
             AND (s.lease_until IS NULL OR s.lease_until < ?)
           ORDER BY s.next_run_at ASC
           LIMIT ?`,
        )
        .all(now.getTime(), now.getTime(), Math.min(100, Math.max(1, limit))) as { id: string }[];
      return rows.map((row) => row.id);
    },
    async listUnscheduledScheduleIds(limit) {
      const rows = client.sqlite
        .prepare(
          `SELECT r.id AS id
           FROM automation_rules r
           INNER JOIN automation_runtime_state s ON s.automation_id = r.id
           WHERE r.enabled = 1
             AND r.trigger_type = 'schedule'
             AND s.next_run_at IS NULL
           LIMIT ?`,
        )
        .all(Math.min(100, Math.max(1, limit))) as { id: string }[];
      return rows.map((row) => row.id);
    },
    async listEnabledEventRuleIds(limit) {
      const rows = client.sqlite
        .prepare(
          `SELECT id
           FROM automation_rules
           WHERE enabled = 1
             AND trigger_type IN ('event', 'status-transition')
           LIMIT ?`,
        )
        .all(Math.min(100, Math.max(1, limit))) as { id: string }[];
      return rows.map((row) => row.id);
    },
    async claimLease(input) {
      const result = client.sqlite
        .prepare(
          `UPDATE automation_runtime_state
           SET lease_owner = ?, lease_until = ?
           WHERE automation_id = ?
             AND EXISTS (
               SELECT 1 FROM automation_rules
               WHERE id = automation_id AND enabled = 1
             )
             AND (
               lease_until IS NULL
               OR lease_until < ?
               OR lease_owner = ?
             )`,
        )
        .run(
          input.workerId,
          input.leaseUntil.getTime(),
          input.automationId,
          input.now.getTime(),
          input.workerId,
        );
      return Number(result.changes) === 1;
    },
    async releaseLease(input) {
      client.sqlite
        .prepare(
          `UPDATE automation_runtime_state
           SET lease_owner = NULL, lease_until = NULL
           WHERE automation_id = ? AND lease_owner = ?`,
        )
        .run(input.automationId, input.workerId);
    },
    async updateRuntime(automationId, patch) {
      const current = await this.getRuntime(automationId);
      if (!current) return;
      const nextRunAt = patch.nextRunAt !== undefined ? patch.nextRunAt : current.nextRunAt;
      const lastTriggeredAt =
        patch.lastTriggeredAt !== undefined ? patch.lastTriggeredAt : current.lastTriggeredAt;
      const lastCompletedAt =
        patch.lastCompletedAt !== undefined ? patch.lastCompletedAt : current.lastCompletedAt;
      const lastObservedState =
        patch.lastObservedState !== undefined ? patch.lastObservedState : current.lastObservedState;
      const failureCount =
        patch.failureCount !== undefined ? patch.failureCount : current.failureCount;
      client.sqlite
        .prepare(
          `UPDATE automation_runtime_state
           SET next_run_at = ?, last_triggered_at = ?, last_completed_at = ?,
               last_observed_state = ?, failure_count = ?
           WHERE automation_id = ?`,
        )
        .run(
          nextRunAt ? nextRunAt.getTime() : null,
          lastTriggeredAt ? lastTriggeredAt.getTime() : null,
          lastCompletedAt ? lastCompletedAt.getTime() : null,
          lastObservedState ? JSON.stringify(lastObservedState) : null,
          failureCount,
          automationId,
        );
    },
    async finishRun(input) {
      const summary = input.summaryJson ? JSON.stringify(input.summaryJson) : null;
      client.sqlite
        .prepare(
          `UPDATE automation_runs
           SET status = ?, finished_at = ?, error_code = ?, resource_id = ?, summary_json = ?
           WHERE id = ? AND status IN ('running', 'scheduled')`,
        )
        .run(
          input.status,
          input.finishedAt.getTime(),
          input.errorCode ?? null,
          input.resourceId ?? null,
          summary,
          input.runId,
        );
    },
    async markStaleRunsUnknown(now, olderThanMs) {
      const cutoff = now.getTime() - olderThanMs;
      const result = client.sqlite
        .prepare(
          `UPDATE automation_runs
           SET status = 'unknown', finished_at = ?, error_code = 'STALE_RUN'
           WHERE status IN ('running', 'scheduled') AND started_at <= ?`,
        )
        .run(now.getTime(), cutoff);
      return Number(result.changes);
    },
  };
}

export function createPostgresqlAutomationStore(client: PostgresqlClient): AutomationStore {
  const { db } = client;
  const rules = postgresqlSchema.automationRules;
  const state = postgresqlSchema.automationRuntimeState;
  const runs = postgresqlSchema.automationRuns;

  async function load(id: string): Promise<AutomationRuleRecord | null> {
    const rows = await db.select().from(rules).where(eq(rules.id, id));
    const found = rows[0];
    if (!found) return null;
    return toRule({
      ...found,
      description: found.description ?? null,
      ownerUserId: found.ownerUserId ?? null,
      lastEnabledAt: found.lastEnabledAt ?? null,
      conditionConfigJson: found.conditionConfigJson ?? null,
    });
  }

  return {
    async create(input) {
      const parsed = parseAutomationRuleCreate(input);
      const now = new Date();
      const id = randomUUID();
      await db.insert(rules).values({
        id,
        name: parsed.name,
        description: parsed.description ?? null,
        enabled: false,
        ownerUserId: parsed.ownerUserId,
        triggerType: parsed.triggerType,
        triggerConfigJson: parsed.triggerConfigJson,
        conditionConfigJson: parsed.conditionConfigJson ?? null,
        actionType: parsed.actionType,
        actionConfigJson: parsed.actionConfigJson,
        cooldownSeconds: parsed.cooldownSeconds ?? 60,
        configRevision: 1,
        createdAt: now,
        updatedAt: now,
      });
      await db.insert(state).values({ automationId: id, failureCount: 0 });
      const created = await load(id);
      if (!created) throw new AutomationError("NOT_FOUND", "Automation not found");
      return created;
    },
    get: load,
    async list() {
      const rows = await db.select().from(rules).orderBy(rules.name);
      return rows.map((found) =>
        toRule({
          ...found,
          description: found.description ?? null,
          ownerUserId: found.ownerUserId ?? null,
          lastEnabledAt: found.lastEnabledAt ?? null,
          conditionConfigJson: found.conditionConfigJson ?? null,
        }),
      );
    },
    async update(id, input) {
      const parsed = parseAutomationRuleUpdate(input);
      const existing = await load(id);
      if (!existing) throw new AutomationError("NOT_FOUND", "Automation not found");
      const now = new Date();
      const updatedRows = await db
        .update(rules)
        .set({
          ...(parsed.name !== undefined ? { name: parsed.name } : {}),
          ...(parsed.description !== undefined ? { description: parsed.description } : {}),
          ...(parsed.triggerType !== undefined ? { triggerType: parsed.triggerType } : {}),
          ...(parsed.triggerConfigJson ? { triggerConfigJson: parsed.triggerConfigJson } : {}),
          ...(parsed.conditionConfigJson !== undefined
            ? { conditionConfigJson: parsed.conditionConfigJson }
            : {}),
          ...(parsed.actionType !== undefined ? { actionType: parsed.actionType } : {}),
          ...(parsed.actionConfigJson ? { actionConfigJson: parsed.actionConfigJson } : {}),
          ...(parsed.cooldownSeconds !== undefined
            ? { cooldownSeconds: parsed.cooldownSeconds }
            : {}),
          configRevision: existing.configRevision + 1,
          updatedAt: now,
        })
        .where(and(eq(rules.id, id), eq(rules.configRevision, parsed.expectedConfigRevision)))
        .returning({ id: rules.id });
      await assertRevisionOrThrow(true, updatedRows.length === 1);
      const updated = await load(id);
      if (!updated) throw new AutomationError("NOT_FOUND", "Automation not found");
      return updated;
    },
    async setEnabled(id, input) {
      const parsed = parseAutomationEnabledUpdate(input);
      const existing = await load(id);
      if (!existing) throw new AutomationError("NOT_FOUND", "Automation not found");
      const now = new Date();
      const updatedRows = await db
        .update(rules)
        .set({
          enabled: parsed.enabled,
          lastEnabledAt: parsed.enabled ? now : existing.lastEnabledAt,
          configRevision: existing.configRevision + 1,
          updatedAt: now,
        })
        .where(and(eq(rules.id, id), eq(rules.configRevision, parsed.expectedConfigRevision)))
        .returning({ id: rules.id });
      await assertRevisionOrThrow(true, updatedRows.length === 1);
      const updated = await load(id);
      if (!updated) throw new AutomationError("NOT_FOUND", "Automation not found");
      if (parsed.enabled) {
        await db
          .update(state)
          .set({
            nextRunAt: nextRunAtForEnable(updated, now),
            leaseOwner: null,
            leaseUntil: null,
          })
          .where(eq(state.automationId, id));
      } else {
        await db
          .update(state)
          .set({
            nextRunAt: null,
            leaseOwner: null,
            leaseUntil: null,
          })
          .where(eq(state.automationId, id));
      }
      return updated;
    },
    async delete(id) {
      const deleted = await db.delete(rules).where(eq(rules.id, id)).returning({ id: rules.id });
      if (deleted.length !== 1) throw new AutomationError("NOT_FOUND", "Automation not found");
    },
    async recordRun(input) {
      const parsed = parseAutomationRunCreate(input);
      const now = new Date();
      const rows = await db
        .insert(runs)
        .values({
          id: randomUUID(),
          automationId: parsed.automationId,
          runKey: parsed.runKey,
          triggerType: parsed.triggerType,
          status: parsed.status,
          scheduledFor: parsed.scheduledFor ?? null,
          startedAt: parsed.startedAt,
          finishedAt: parsed.finishedAt ?? null,
          actionType: parsed.actionType,
          errorCode: parsed.errorCode ?? null,
          resourceId: parsed.resourceId ?? null,
          summaryJson: parsed.summaryJson ?? null,
          createdAt: now,
        })
        .returning();
      const found = rows[0];
      if (!found) throw new AutomationError("NOT_FOUND", "Automation run not found");
      return toRun({
        ...found,
        automationId: found.automationId ?? null,
        scheduledFor: found.scheduledFor ?? null,
        finishedAt: found.finishedAt ?? null,
        errorCode: found.errorCode ?? null,
        resourceId: found.resourceId ?? null,
        summaryJson: found.summaryJson ?? null,
      });
    },
    async listRuns(automationId, limit = 50) {
      const rows = await db
        .select()
        .from(runs)
        .where(eq(runs.automationId, automationId))
        .orderBy(desc(runs.startedAt))
        .limit(Math.min(100, Math.max(1, limit)));
      return rows.map((found) =>
        toRun({
          ...found,
          automationId: found.automationId ?? null,
          scheduledFor: found.scheduledFor ?? null,
          finishedAt: found.finishedAt ?? null,
          errorCode: found.errorCode ?? null,
          resourceId: found.resourceId ?? null,
          summaryJson: found.summaryJson ?? null,
        }),
      );
    },
    async purgeHistory(now = new Date()) {
      const cutoff = new Date(now.getTime() - AUTOMATION_RUN_RETENTION_MS);
      const expired = await db.delete(runs).where(lt(runs.finishedAt, cutoff)).returning({
        id: runs.id,
      });
      const extras = await db.execute(sql`
        DELETE FROM automation_runs
        WHERE id IN (
          SELECT id FROM (
            SELECT id, ROW_NUMBER() OVER (
              PARTITION BY automation_id ORDER BY started_at DESC
            ) AS rn
            FROM automation_runs
            WHERE automation_id IS NOT NULL
          ) ranked
          WHERE rn > ${AUTOMATION_RUN_MAX_PER_RULE}
        )
      `);
      return expired.length + Number(extras.rowCount ?? 0);
    },
    async tryInsertRun(input) {
      try {
        return { run: await this.recordRun(input), created: true };
      } catch (error) {
        const normalized = normalizeDatabaseError(error);
        if (normalized.code !== "UNIQUE_CONSTRAINT") throw error;
        const existing = await this.getRunByKey(input.runKey);
        if (!existing) throw error;
        return { run: existing, created: false };
      }
    },
    async getRunByKey(runKey) {
      const rows = await db.select().from(runs).where(eq(runs.runKey, runKey));
      const found = rows[0];
      if (!found) return null;
      return toRun({
        ...found,
        automationId: found.automationId ?? null,
        scheduledFor: found.scheduledFor ?? null,
        finishedAt: found.finishedAt ?? null,
        errorCode: found.errorCode ?? null,
        resourceId: found.resourceId ?? null,
        summaryJson: found.summaryJson ?? null,
      });
    },
    async getRuntime(id) {
      const rows = await db.select().from(state).where(eq(state.automationId, id));
      const found = rows[0];
      if (!found) return null;
      return toRuntime({
        ...found,
        nextRunAt: found.nextRunAt ?? null,
        lastTriggeredAt: found.lastTriggeredAt ?? null,
        lastCompletedAt: found.lastCompletedAt ?? null,
        lastObservedState: found.lastObservedState ?? null,
        leaseOwner: found.leaseOwner ?? null,
        leaseUntil: found.leaseUntil ?? null,
      });
    },
    async listDueScheduleIds(now, limit) {
      const result = await client.pool.query<{ id: string }>(
        `SELECT r.id AS id
         FROM automation_rules r
         INNER JOIN automation_runtime_state s ON s.automation_id = r.id
         WHERE r.enabled = true
           AND r.trigger_type = 'schedule'
           AND s.next_run_at IS NOT NULL
           AND s.next_run_at <= $1
           AND (s.lease_until IS NULL OR s.lease_until < $1)
         ORDER BY s.next_run_at ASC
         LIMIT $2`,
        [now, Math.min(100, Math.max(1, limit))],
      );
      return result.rows.map((row) => row.id);
    },
    async listDueStatusDebounceIds(now, limit) {
      const result = await client.pool.query<{ id: string }>(
        `SELECT r.id AS id
         FROM automation_rules r
         INNER JOIN automation_runtime_state s ON s.automation_id = r.id
         WHERE r.enabled = true
           AND r.trigger_type = 'status-transition'
           AND s.next_run_at IS NOT NULL
           AND s.next_run_at <= $1
           AND (s.lease_until IS NULL OR s.lease_until < $1)
         ORDER BY s.next_run_at ASC
         LIMIT $2`,
        [now, Math.min(100, Math.max(1, limit))],
      );
      return result.rows.map((row) => row.id);
    },
    async listUnscheduledScheduleIds(limit) {
      const result = await client.pool.query<{ id: string }>(
        `SELECT r.id AS id
         FROM automation_rules r
         INNER JOIN automation_runtime_state s ON s.automation_id = r.id
         WHERE r.enabled = true
           AND r.trigger_type = 'schedule'
           AND s.next_run_at IS NULL
         LIMIT $1`,
        [Math.min(100, Math.max(1, limit))],
      );
      return result.rows.map((row) => row.id);
    },
    async listEnabledEventRuleIds(limit) {
      const result = await client.pool.query<{ id: string }>(
        `SELECT id
         FROM automation_rules
         WHERE enabled = true
           AND trigger_type IN ('event', 'status-transition')
         LIMIT $1`,
        [Math.min(100, Math.max(1, limit))],
      );
      return result.rows.map((row) => row.id);
    },
    async claimLease(input) {
      const result = await client.pool.query(
        `UPDATE automation_runtime_state AS s
         SET lease_owner = $1, lease_until = $2
         FROM automation_rules AS r
         WHERE s.automation_id = r.id
           AND s.automation_id = $3
           AND r.enabled = true
           AND (
             s.lease_until IS NULL
             OR s.lease_until < $4
             OR s.lease_owner = $1
           )
         RETURNING s.automation_id`,
        [input.workerId, input.leaseUntil, input.automationId, input.now],
      );
      return result.rowCount === 1;
    },
    async releaseLease(input) {
      await client.pool.query(
        `UPDATE automation_runtime_state
         SET lease_owner = NULL, lease_until = NULL
         WHERE automation_id = $1 AND lease_owner = $2`,
        [input.automationId, input.workerId],
      );
    },
    async updateRuntime(automationId, patch) {
      const current = await this.getRuntime(automationId);
      if (!current) return;
      const nextRunAt = patch.nextRunAt !== undefined ? patch.nextRunAt : current.nextRunAt;
      const lastTriggeredAt =
        patch.lastTriggeredAt !== undefined ? patch.lastTriggeredAt : current.lastTriggeredAt;
      const lastCompletedAt =
        patch.lastCompletedAt !== undefined ? patch.lastCompletedAt : current.lastCompletedAt;
      const lastObservedState =
        patch.lastObservedState !== undefined ? patch.lastObservedState : current.lastObservedState;
      const failureCount =
        patch.failureCount !== undefined ? patch.failureCount : current.failureCount;
      await client.pool.query(
        `UPDATE automation_runtime_state
         SET next_run_at = $1, last_triggered_at = $2, last_completed_at = $3,
             last_observed_state = $4::jsonb, failure_count = $5
         WHERE automation_id = $6`,
        [
          nextRunAt,
          lastTriggeredAt,
          lastCompletedAt,
          lastObservedState ? JSON.stringify(lastObservedState) : null,
          failureCount,
          automationId,
        ],
      );
    },
    async finishRun(input) {
      await client.pool.query(
        `UPDATE automation_runs
         SET status = $1, finished_at = $2, error_code = $3, resource_id = $4, summary_json = $5::jsonb
         WHERE id = $6 AND status IN ('running', 'scheduled')`,
        [
          input.status,
          input.finishedAt,
          input.errorCode ?? null,
          input.resourceId ?? null,
          input.summaryJson ? JSON.stringify(input.summaryJson) : null,
          input.runId,
        ],
      );
    },
    async markStaleRunsUnknown(now, olderThanMs) {
      const cutoff = new Date(now.getTime() - olderThanMs);
      const result = await client.pool.query(
        `UPDATE automation_runs
         SET status = 'unknown', finished_at = $1, error_code = 'STALE_RUN'
         WHERE status IN ('running', 'scheduled') AND started_at <= $2`,
        [now, cutoff],
      );
      return result.rowCount ?? 0;
    },
  };
}

export function toAutomationSchedulerStore(store: AutomationStore) {
  return {
    getRule: (id: string) => store.get(id),
    getRuntime: (id: string) => store.getRuntime(id),
    listDueScheduleIds: (now: Date, limit: number) => store.listDueScheduleIds(now, limit),
    listDueStatusDebounceIds: (now: Date, limit: number) =>
      store.listDueStatusDebounceIds(now, limit),
    listUnscheduledScheduleIds: (limit: number) => store.listUnscheduledScheduleIds(limit),
    listEnabledEventRuleIds: (limit: number) => store.listEnabledEventRuleIds(limit),
    claimLease: (input: AutomationLeaseClaimInput) => store.claimLease(input),
    releaseLease: (input: { automationId: string; workerId: string }) => store.releaseLease(input),
    updateRuntime: (automationId: string, patch: AutomationRuntimePatch) =>
      store.updateRuntime(automationId, patch),
    async tryInsertRun(input: {
      automationId: string;
      runKey: string;
      triggerType: AutomationTriggerType;
      status: AutomationRunStatus;
      scheduledFor?: Date | null;
      startedAt: Date;
      actionType: AutomationActionType;
    }) {
      const payload: AutomationRunCreateInput = {
        automationId: input.automationId,
        runKey: input.runKey,
        triggerType: input.triggerType,
        status: input.status,
        startedAt: input.startedAt,
        actionType: input.actionType,
      };
      if (input.scheduledFor !== undefined) payload.scheduledFor = input.scheduledFor;
      const result = await store.tryInsertRun(payload);
      return {
        created: result.created,
        run: {
          id: result.run.id,
          automationId: result.run.automationId,
          runKey: result.run.runKey,
          status: result.run.status,
          startedAt: result.run.startedAt,
          finishedAt: result.run.finishedAt,
        },
      };
    },
    finishRun: (input: {
      runId: string;
      status: AutomationRunStatus;
      finishedAt: Date;
      errorCode?: string | null;
      resourceId?: string | null;
      summaryJson?: Record<string, unknown> | null;
    }) => store.finishRun(input),
    markStaleRunsUnknown: (now: Date, olderThanMs: number) =>
      store.markStaleRunsUnknown(now, olderThanMs),
  };
}
