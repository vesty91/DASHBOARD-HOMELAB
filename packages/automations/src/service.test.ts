import { describe, expect, it } from "vitest";
import { AutomationError } from "./errors";
import { createAutomationService } from "./service";
import type { AutomationRuleStorePort } from "./service";
import type { AutomationRuleCreateInput } from "./schemas";

const OWNER_ID = "00000000-0000-4000-8000-000000000001";
const INTEGRATION_ID = "00000000-0000-4000-8000-000000000099";

function createInput(): AutomationRuleCreateInput {
  return {
    name: "Alert down",
    ownerUserId: OWNER_ID,
    triggerType: "status-transition",
    triggerConfigJson: { from: "available", to: "unavailable" },
    actionType: "ntfy.publish",
    actionConfigJson: {
      integrationId: INTEGRATION_ID,
      topic: "homelab",
      message: "down",
    },
    cooldownSeconds: 60,
  };
}

function memoryStore(): AutomationRuleStorePort & {
  rules: Map<string, Awaited<ReturnType<AutomationRuleStorePort["get"]>> & object>;
} {
  const rules = new Map<string, NonNullable<Awaited<ReturnType<AutomationRuleStorePort["get"]>>>>();
  return {
    rules,
    async create(input) {
      const now = new Date("2026-09-15T12:00:00.000Z");
      const rule = {
        id: "00000000-0000-4000-8000-000000000010",
        ...input,
        description: input.description ?? null,
        enabled: false,
        conditionConfigJson: input.conditionConfigJson ?? null,
        cooldownSeconds: input.cooldownSeconds ?? 0,
        configRevision: 1,
        lastEnabledAt: null,
        createdAt: now,
        updatedAt: now,
      };
      rules.set(rule.id, rule);
      return rule;
    },
    async get(id) {
      return rules.get(id) ?? null;
    },
    async list() {
      return [...rules.values()];
    },
    async update(id, input) {
      const current = rules.get(id);
      if (!current) throw new Error("missing");
      if (current.configRevision !== input.expectedConfigRevision)
        throw new AutomationError("CONFLICT", "stale");
      const updated = {
        id: current.id,
        name: input.name ?? current.name,
        description: input.description === undefined ? current.description : input.description,
        enabled: current.enabled,
        ownerUserId: current.ownerUserId,
        triggerType: input.triggerType ?? current.triggerType,
        triggerConfigJson: input.triggerConfigJson ?? current.triggerConfigJson,
        conditionConfigJson:
          input.conditionConfigJson === undefined
            ? current.conditionConfigJson
            : input.conditionConfigJson,
        actionType: input.actionType ?? current.actionType,
        actionConfigJson: input.actionConfigJson ?? current.actionConfigJson,
        cooldownSeconds: input.cooldownSeconds ?? current.cooldownSeconds,
        configRevision: current.configRevision + 1,
        lastEnabledAt: current.lastEnabledAt,
        createdAt: current.createdAt,
        updatedAt: new Date("2026-09-15T12:01:00.000Z"),
      };
      rules.set(id, updated);
      return updated;
    },
    async setEnabled(id, input) {
      const current = rules.get(id);
      if (!current) throw new Error("missing");
      if (current.configRevision !== input.expectedConfigRevision)
        throw new AutomationError("CONFLICT", "stale");
      const updated = {
        ...current,
        enabled: input.enabled,
        configRevision: current.configRevision + 1,
        lastEnabledAt: input.enabled ? new Date("2026-09-15T12:02:00.000Z") : current.lastEnabledAt,
        updatedAt: new Date("2026-09-15T12:02:00.000Z"),
      };
      rules.set(id, updated);
      return updated;
    },
    async delete(id) {
      rules.delete(id);
    },
    async listRuns() {
      return [];
    },
    async getRuntime() {
      return {
        nextRunAt: null,
        lastTriggeredAt: null,
        lastCompletedAt: null,
        lastObservedState: null,
      };
    },
    async tryInsertRun() {
      return { created: true, run: { id: "run-1", status: "running" } };
    },
    async finishRun() {
      return;
    },
  };
}

describe("automation service", () => {
  it("creates disabled rules and dry-runs without side effects", async () => {
    const store = memoryStore();
    let dispatched = 0;
    const service = createAutomationService({
      store,
      async loadOwner() {
        return {
          id: OWNER_ID,
          status: "active",
          isSystemAdmin: true,
        };
      },
      async integrationExists() {
        return true;
      },
      dispatcher: {
        async dispatch() {
          dispatched += 1;
          return { status: "succeeded", resourceId: "homelab" };
        },
      },
    });
    const actor = {
      userId: OWNER_ID,
      subject: { status: "active" as const, isSystemAdmin: true },
    };
    const created = await service.create(createInput(), actor);
    expect(created.enabled).toBe(false);
    await expect(service.dryRun(created.id, actor)).resolves.toEqual({
      outcome: "would-run",
      reasonCode: "OK",
    });
    expect(dispatched).toBe(0);
    await service.setEnabled(
      created.id,
      { expectedConfigRevision: created.configRevision, enabled: true },
      actor,
    );
    await service.manualRun(created.id, actor);
    expect(dispatched).toBe(1);
  });

  it("denies dry-run without automation.run", async () => {
    const store = memoryStore();
    const service = createAutomationService({
      store,
      async loadOwner() {
        return { id: OWNER_ID, status: "active", isSystemAdmin: false };
      },
      async integrationExists() {
        return true;
      },
    });
    const manageActor = {
      userId: OWNER_ID,
      subject: {
        status: "active" as const,
        isSystemAdmin: true,
      },
    };
    const created = await service.create(createInput(), manageActor);
    await expect(
      service.dryRun(created.id, {
        userId: OWNER_ID,
        subject: {
          status: "active",
          isSystemAdmin: false,
          directPermissions: ["automation.manage"],
        },
      }),
    ).rejects.toMatchObject({ code: "DENIED_PERMISSION" });
  });
});
