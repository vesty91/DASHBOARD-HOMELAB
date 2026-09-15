import { randomUUID } from "node:crypto";
import { and, desc, eq, lt, sql } from "drizzle-orm";
import {
  AutomationError,
  AUTOMATION_RUN_MAX_PER_RULE,
  AUTOMATION_RUN_RETENTION_MS,
  parseAutomationEnabledUpdate,
  parseAutomationRuleCreate,
  parseAutomationRuleUpdate,
  parseAutomationRunCreate,
  type AutomationActionType,
  type AutomationRuleCreateInput,
  type AutomationRuleUpdateInput,
  type AutomationRunStatus,
  type AutomationTriggerType,
} from "@dashboard/automations";
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
  recordRun(input: Parameters<typeof parseAutomationRunCreate>[0]): Promise<AutomationRunRecord>;
  listRuns(automationId: string, limit?: number): Promise<AutomationRunRecord[]>;
  purgeHistory(now?: Date): Promise<number>;
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
  };
}
