import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  ALERTING_DEFAULT_COOLDOWN_SECONDS,
  ALERTING_DEFAULT_FOR_DURATION_SECONDS,
  buildIntegrationDownAlert,
  buildIntegrationRecoveryAlert,
} from "./alerting";
import { parseAutomationRuleCreate } from "./schemas";
import { createSafeAutomationDispatcher } from "./safe-dispatch";
import {
  AutomationScheduler,
  type AutomationRuleSnapshot,
  type AutomationRunInsertInput,
  type AutomationRunSnapshot,
  type AutomationRuntimeSnapshot,
  type AutomationSchedulerStore,
} from "./scheduler";
import type { AutomationActionDispatcher } from "./dispatcher";

const OWNER_ID = "00000000-0000-4000-8000-000000000001";
const WATCHED_ID = "00000000-0000-4000-8000-000000000050";
const NTFY_ID = "00000000-0000-4000-8000-000000000060";

function statusEvent(
  status: "available" | "unavailable",
  occurredAt: string,
  integrationId = WATCHED_ID,
) {
  return {
    type: "integration.status.changed" as const,
    integrationId,
    integrationType: "sonarr",
    status,
    occurredAt,
  };
}

function transitionRule(
  id: string,
  config: Record<string, unknown>,
  cooldownSeconds = 0,
): AutomationRuleSnapshot {
  return {
    id,
    enabled: true,
    ownerUserId: OWNER_ID,
    triggerType: "status-transition",
    triggerConfigJson: config,
    conditionConfigJson: null,
    actionType: "ntfy.publish",
    actionConfigJson: {
      integrationId: NTFY_ID,
      topic: "homelab",
      message: "alert",
    },
    cooldownSeconds,
  };
}

function runtime(id: string): AutomationRuntimeSnapshot {
  return {
    automationId: id,
    nextRunAt: null,
    lastTriggeredAt: null,
    lastCompletedAt: null,
    lastObservedState: { status: "available" },
    failureCount: 0,
    leaseOwner: null,
    leaseUntil: null,
  };
}

class MemoryStore implements AutomationSchedulerStore {
  readonly rules = new Map<string, AutomationRuleSnapshot>();
  readonly runtimes = new Map<string, AutomationRuntimeSnapshot>();
  readonly runs: AutomationRunSnapshot[] = [];

  seed(rule: AutomationRuleSnapshot, state: AutomationRuntimeSnapshot): void {
    this.rules.set(rule.id, rule);
    this.runtimes.set(rule.id, { ...state });
  }

  async getRule(id: string) {
    return this.rules.get(id) ?? null;
  }
  async getRuntime(id: string) {
    const found = this.runtimes.get(id);
    return found ? { ...found } : null;
  }
  async listDueScheduleIds() {
    return [];
  }
  async listDueStatusDebounceIds(now: Date, limit: number) {
    return [...this.rules.values()]
      .filter((rule) => {
        const state = this.runtimes.get(rule.id);
        return (
          rule.enabled &&
          rule.triggerType === "status-transition" &&
          state?.nextRunAt != null &&
          state.nextRunAt.getTime() <= now.getTime()
        );
      })
      .slice(0, limit)
      .map((rule) => rule.id);
  }
  async listUnscheduledScheduleIds() {
    return [];
  }
  async listEnabledEventRuleIds(limit: number) {
    return [...this.rules.values()]
      .filter((rule) => rule.enabled && rule.triggerType === "status-transition")
      .slice(0, limit)
      .map((rule) => rule.id);
  }
  async claimLease(input: { automationId: string; workerId: string; now: Date; leaseUntil: Date }) {
    const state = this.runtimes.get(input.automationId);
    if (!state) return false;
    if (state.leaseUntil && state.leaseUntil.getTime() > input.now.getTime()) {
      if (state.leaseOwner !== input.workerId) return false;
    }
    state.leaseOwner = input.workerId;
    state.leaseUntil = input.leaseUntil;
    return true;
  }
  async releaseLease(input: { automationId: string; workerId: string }) {
    const state = this.runtimes.get(input.automationId);
    if (!state || state.leaseOwner !== input.workerId) return;
    state.leaseOwner = null;
    state.leaseUntil = null;
  }
  async updateRuntime(
    automationId: string,
    patch: Partial<AutomationRuntimeSnapshot> & {
      nextRunAt?: Date | null;
      lastObservedState?: Record<string, unknown> | null;
    },
  ) {
    const state = this.runtimes.get(automationId);
    if (!state) return;
    if (patch.nextRunAt !== undefined) state.nextRunAt = patch.nextRunAt;
    if (patch.lastTriggeredAt !== undefined) state.lastTriggeredAt = patch.lastTriggeredAt;
    if (patch.lastCompletedAt !== undefined) state.lastCompletedAt = patch.lastCompletedAt;
    if (patch.lastObservedState !== undefined) state.lastObservedState = patch.lastObservedState;
    if (patch.failureCount !== undefined) state.failureCount = patch.failureCount;
  }
  async tryInsertRun(input: AutomationRunInsertInput) {
    const existing = this.runs.find((run) => run.runKey === input.runKey);
    if (existing) return { run: existing, created: false };
    const run: AutomationRunSnapshot = {
      id: randomUUID(),
      automationId: input.automationId,
      runKey: input.runKey,
      status: input.status,
      startedAt: input.startedAt,
      finishedAt: null,
    };
    this.runs.push(run);
    return { run, created: true };
  }
  async finishRun(input: {
    runId: string;
    status: AutomationRunSnapshot["status"];
    finishedAt: Date;
  }) {
    const run = this.runs.find((entry) => entry.id === input.runId);
    if (!run || (run.status !== "running" && run.status !== "scheduled")) return;
    run.status = input.status;
    run.finishedAt = input.finishedAt;
  }
  async markStaleRunsUnknown() {
    return 0;
  }
}

function recordingDispatcher(
  result: Awaited<ReturnType<AutomationActionDispatcher["dispatch"]>> = {
    status: "succeeded",
    resourceId: "homelab",
  },
) {
  let calls = 0;
  const dispatcher: AutomationActionDispatcher & { calls: number } = {
    get calls() {
      return calls;
    },
    async dispatch() {
      calls += 1;
      return result;
    },
  };
  return dispatcher;
}

describe("alerting builders", () => {
  it("builds valid down and recovery ntfy automations", () => {
    const down = buildIntegrationDownAlert({
      name: "Sonarr down",
      ownerUserId: OWNER_ID,
      watchedIntegrationId: WATCHED_ID,
      watchedIntegrationType: "sonarr",
      ntfyIntegrationId: NTFY_ID,
      topic: "homelab",
      message: "Sonarr is down",
      title: "DOWN",
    });
    const recovery = buildIntegrationRecoveryAlert({
      name: "Sonarr up",
      ownerUserId: OWNER_ID,
      watchedIntegrationId: WATCHED_ID,
      ntfyIntegrationId: NTFY_ID,
      topic: "homelab",
      message: "Sonarr recovered",
    });
    expect(parseAutomationRuleCreate(down).triggerConfigJson).toMatchObject({
      from: "available",
      to: "unavailable",
      forDurationSeconds: ALERTING_DEFAULT_FOR_DURATION_SECONDS,
    });
    expect(parseAutomationRuleCreate(recovery).cooldownSeconds).toBe(
      ALERTING_DEFAULT_COOLDOWN_SECONDS,
    );
    expect(JSON.stringify({ down, recovery })).not.toMatch(/token|password|cookie/iu);
  });
});

describe("status alerting runtime", () => {
  it("fires available → unavailable and optional recovery", async () => {
    const store = new MemoryStore();
    const down = transitionRule("00000000-0000-4000-8000-000000000101", {
      from: "available",
      to: "unavailable",
      integrationId: WATCHED_ID,
    });
    const recovery = transitionRule("00000000-0000-4000-8000-000000000102", {
      from: "unavailable",
      to: "available",
      integrationId: WATCHED_ID,
    });
    store.seed(down, runtime(down.id));
    store.seed(recovery, {
      ...runtime(recovery.id),
      lastObservedState: { status: "available" },
    });
    const dispatcher = recordingDispatcher();
    let now = new Date("2026-09-15T12:00:00.000Z");
    const scheduler = new AutomationScheduler({
      workerId: "w-alert",
      store,
      dispatcher,
      now: () => now,
    });
    await scheduler.handleEvent(statusEvent("unavailable", now.toISOString()));
    expect(dispatcher.calls).toBe(1);
    now = new Date("2026-09-15T12:05:00.000Z");
    await scheduler.handleEvent(statusEvent("unavailable", now.toISOString()));
    expect(dispatcher.calls).toBe(1);
    now = new Date("2026-09-15T12:10:00.000Z");
    await scheduler.handleEvent(statusEvent("available", now.toISOString()));
    expect(dispatcher.calls).toBe(2);
  });

  it("debounces DOWN with forDurationSeconds and cancels on flap", async () => {
    const store = new MemoryStore();
    const rule = transitionRule("00000000-0000-4000-8000-000000000103", {
      from: "available",
      to: "unavailable",
      integrationId: WATCHED_ID,
      forDurationSeconds: 60,
    });
    store.seed(rule, runtime(rule.id));
    const dispatcher = recordingDispatcher();
    let now = new Date("2026-09-15T12:00:00.000Z");
    const scheduler = new AutomationScheduler({
      workerId: "w-debounce",
      store,
      dispatcher,
      now: () => now,
    });
    await scheduler.handleEvent(statusEvent("unavailable", now.toISOString()));
    expect(dispatcher.calls).toBe(0);
    expect(store.runtimes.get(rule.id)?.nextRunAt?.toISOString()).toBe("2026-09-15T12:01:00.000Z");
    now = new Date("2026-09-15T12:00:30.000Z");
    await scheduler.handleEvent(statusEvent("available", now.toISOString()));
    expect(dispatcher.calls).toBe(0);
    expect(store.runtimes.get(rule.id)?.nextRunAt).toBeNull();
    now = new Date("2026-09-15T12:01:00.000Z");
    await scheduler.tick();
    expect(dispatcher.calls).toBe(0);

    now = new Date("2026-09-15T12:02:00.000Z");
    await scheduler.handleEvent(statusEvent("unavailable", now.toISOString()));
    now = new Date("2026-09-15T12:03:00.000Z");
    await scheduler.tick();
    expect(dispatcher.calls).toBe(1);
  });

  it("respects cooldown to avoid alert storms", async () => {
    const store = new MemoryStore();
    const rule = transitionRule(
      "00000000-0000-4000-8000-000000000104",
      { from: "available", to: "unavailable", integrationId: WATCHED_ID },
      300,
    );
    store.seed(rule, runtime(rule.id));
    const dispatcher = recordingDispatcher();
    let now = new Date("2026-09-15T12:00:00.000Z");
    const scheduler = new AutomationScheduler({
      workerId: "w-cool",
      store,
      dispatcher,
      now: () => now,
    });
    await scheduler.handleEvent(statusEvent("unavailable", now.toISOString()));
    expect(dispatcher.calls).toBe(1);
    now = new Date("2026-09-15T12:01:00.000Z");
    await scheduler.handleEvent(statusEvent("available", now.toISOString()));
    now = new Date("2026-09-15T12:02:00.000Z");
    await scheduler.handleEvent(statusEvent("unavailable", now.toISOString()));
    expect(dispatcher.calls).toBe(1);
  });

  it("denies when live automation.run permission is revoked", async () => {
    const store = new MemoryStore();
    const rule = transitionRule("00000000-0000-4000-8000-000000000105", {
      from: "available",
      to: "unavailable",
      integrationId: WATCHED_ID,
    });
    store.seed(rule, runtime(rule.id));
    let executed = 0;
    const dispatcher = createSafeAutomationDispatcher({
      async loadOwner() {
        return {
          id: OWNER_ID,
          status: "active",
          isSystemAdmin: false,
          directPermissions: ["ntfy.publish"],
        };
      },
      executor: {
        async execute() {
          executed += 1;
          return { status: "succeeded" };
        },
      },
    });
    const scheduler = new AutomationScheduler({
      workerId: "w-deny",
      store,
      dispatcher,
      now: () => new Date("2026-09-15T12:00:00.000Z"),
      async loadOwner() {
        return {
          id: OWNER_ID,
          status: "active",
          isSystemAdmin: false,
          directPermissions: ["ntfy.publish"],
        };
      },
    });
    await scheduler.handleEvent(statusEvent("unavailable", "2026-09-15T12:00:00.000Z"));
    expect(executed).toBe(0);
    expect(store.runs[0]?.status).toBe("denied");
  });

  it("records failed ntfy dispatch without retry", async () => {
    const store = new MemoryStore();
    const rule = transitionRule("00000000-0000-4000-8000-000000000106", {
      from: "available",
      to: "unavailable",
      integrationId: WATCHED_ID,
    });
    store.seed(rule, runtime(rule.id));
    const dispatcher = recordingDispatcher({ status: "failed", errorCode: "TIMEOUT" });
    const scheduler = new AutomationScheduler({
      workerId: "w-fail",
      store,
      dispatcher,
      now: () => new Date("2026-09-15T12:00:00.000Z"),
    });
    const event = statusEvent("unavailable", "2026-09-15T12:00:00.000Z");
    await scheduler.handleEvent(event);
    await scheduler.handleEvent(event);
    expect(dispatcher.calls).toBe(1);
    expect(store.runs[0]?.status).toBe("failed");
  });

  it("ignores duplicate Redis deliveries via runKey", async () => {
    const store = new MemoryStore();
    const rule = transitionRule("00000000-0000-4000-8000-000000000107", {
      from: "available",
      to: "unavailable",
      integrationId: WATCHED_ID,
    });
    store.seed(rule, runtime(rule.id));
    const dispatcher = recordingDispatcher();
    const scheduler = new AutomationScheduler({
      workerId: "w-dup",
      store,
      dispatcher,
      now: () => new Date("2026-09-15T12:00:00.000Z"),
    });
    const event = statusEvent("unavailable", "2026-09-15T12:00:00.000Z");
    await scheduler.handleEvent(event);
    await scheduler.handleEvent(event);
    expect(dispatcher.calls).toBe(1);
  });
});
