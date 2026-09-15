import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { unwiredAutomationDispatcher, type AutomationActionDispatcher } from "./dispatcher";
import {
  AUTOMATION_LEASE_MS,
  AutomationScheduler,
  type AutomationRuleSnapshot,
  type AutomationRunInsertInput,
  type AutomationRunSnapshot,
  type AutomationRuntimeSnapshot,
  type AutomationSchedulerStore,
} from "./scheduler";
import { buildEventRunKey, buildScheduleRunKey } from "./run-key";

const OWNER_ID = "00000000-0000-4000-8000-000000000001";
const INTEGRATION_ID = "00000000-0000-4000-8000-000000000099";

function scheduleRule(id: string): AutomationRuleSnapshot {
  return {
    id,
    enabled: true,
    ownerUserId: OWNER_ID,
    triggerType: "schedule",
    triggerConfigJson: { kind: "interval", everyMinutes: 15 },
    conditionConfigJson: null,
    actionType: "ntfy.publish",
    actionConfigJson: { integrationId: INTEGRATION_ID, topic: "homelab" },
    cooldownSeconds: 0,
  };
}

function eventRule(id: string): AutomationRuleSnapshot {
  return {
    id,
    enabled: true,
    ownerUserId: OWNER_ID,
    triggerType: "event",
    triggerConfigJson: { eventType: "integration.status.changed" },
    conditionConfigJson: null,
    actionType: "ntfy.publish",
    actionConfigJson: { integrationId: INTEGRATION_ID, topic: "homelab" },
    cooldownSeconds: 0,
  };
}

function runtime(id: string, nextRunAt: Date | null): AutomationRuntimeSnapshot {
  return {
    automationId: id,
    nextRunAt,
    lastTriggeredAt: null,
    lastCompletedAt: null,
    lastObservedState: null,
    failureCount: 0,
    leaseOwner: null,
    leaseUntil: null,
  };
}

class MemoryStore implements AutomationSchedulerStore {
  readonly rules = new Map<string, AutomationRuleSnapshot>();
  readonly runtimes = new Map<string, AutomationRuntimeSnapshot>();
  readonly runs: AutomationRunSnapshot[] = [];
  throwOnNextRunAdvance = false;
  throwOnFinish = false;
  transientListFailure = false;

  seed(rule: AutomationRuleSnapshot, state: AutomationRuntimeSnapshot): void {
    this.rules.set(rule.id, rule);
    this.runtimes.set(rule.id, { ...state });
  }

  async getRule(id: string) {
    return this.rules.get(id) ?? null;
  }

  async getRuntime(id: string) {
    const found = this.runtimes.get(id);
    return found ? { ...found, lastObservedState: found.lastObservedState } : null;
  }

  async listDueScheduleIds(now: Date, limit: number) {
    if (this.transientListFailure) {
      this.transientListFailure = false;
      throw new Error("DB_UNAVAILABLE");
    }
    return [...this.rules.values()]
      .filter((rule) => {
        const state = this.runtimes.get(rule.id);
        return (
          rule.enabled &&
          rule.triggerType === "schedule" &&
          state?.nextRunAt != null &&
          state.nextRunAt.getTime() <= now.getTime()
        );
      })
      .slice(0, limit)
      .map((rule) => rule.id);
  }

  async listUnscheduledScheduleIds(limit: number) {
    return [...this.rules.values()]
      .filter((rule) => {
        const state = this.runtimes.get(rule.id);
        return rule.enabled && rule.triggerType === "schedule" && state?.nextRunAt == null;
      })
      .slice(0, limit)
      .map((rule) => rule.id);
  }

  async listEnabledEventRuleIds(limit: number) {
    return [...this.rules.values()]
      .filter(
        (rule) =>
          rule.enabled &&
          (rule.triggerType === "event" || rule.triggerType === "status-transition"),
      )
      .slice(0, limit)
      .map((rule) => rule.id);
  }

  async claimLease(input: { automationId: string; workerId: string; now: Date; leaseUntil: Date }) {
    const rule = this.rules.get(input.automationId);
    const state = this.runtimes.get(input.automationId);
    if (!rule?.enabled || !state) return false;
    if (
      state.leaseUntil &&
      state.leaseUntil.getTime() >= input.now.getTime() &&
      state.leaseOwner !== input.workerId
    )
      return false;
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
    patch: {
      nextRunAt?: Date | null;
      lastTriggeredAt?: Date | null;
      lastCompletedAt?: Date | null;
      lastObservedState?: Record<string, unknown> | null;
      failureCount?: number;
    },
  ) {
    if (this.throwOnNextRunAdvance && patch.nextRunAt !== undefined) {
      this.throwOnNextRunAdvance = false;
      throw new Error("CRASH_AFTER_CLAIM");
    }
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
    errorCode?: string | null;
  }) {
    if (this.throwOnFinish) {
      this.throwOnFinish = false;
      throw new Error("CRASH_AFTER_DISPATCH");
    }
    const run = this.runs.find((item) => item.id === input.runId);
    if (!run || (run.status !== "running" && run.status !== "scheduled")) return;
    run.status = input.status;
    run.finishedAt = input.finishedAt;
  }

  async markStaleRunsUnknown(now: Date, olderThanMs: number) {
    let count = 0;
    for (const run of this.runs) {
      if (
        (run.status === "running" || run.status === "scheduled") &&
        now.getTime() - run.startedAt.getTime() >= olderThanMs
      ) {
        run.status = "unknown";
        run.finishedAt = now;
        count += 1;
      }
    }
    return count;
  }
}

function recordingDispatcher(): AutomationActionDispatcher & { calls: number } {
  const recorder = {
    calls: 0,
    async dispatch() {
      recorder.calls += 1;
      return { status: "succeeded" as const, errorCode: null };
    },
  };
  return recorder;
}

describe("automation scheduler", () => {
  it("lets only one worker execute a due schedule", async () => {
    const store = new MemoryStore();
    const due = new Date("2026-09-15T12:00:00.000Z");
    const rule = scheduleRule("00000000-0000-4000-8000-000000000010");
    store.seed(rule, runtime(rule.id, due));
    const dispatcher = recordingDispatcher();
    const a = new AutomationScheduler({
      workerId: "w-a",
      store,
      dispatcher,
      now: () => due,
    });
    const b = new AutomationScheduler({
      workerId: "w-b",
      store,
      dispatcher,
      now: () => due,
    });
    await Promise.all([a.tick(), b.tick()]);
    expect(dispatcher.calls).toBe(1);
    expect(store.runs).toHaveLength(1);
    expect(store.runs[0]?.status).toBe("succeeded");
    expect(store.runs[0]?.runKey).toBe(buildScheduleRunKey(rule.id, due));
  });

  it("does not retry after a crash following claim, and marks the run unknown", async () => {
    const store = new MemoryStore();
    store.throwOnNextRunAdvance = true;
    const due = new Date("2026-09-15T12:00:00.000Z");
    const rule = scheduleRule("00000000-0000-4000-8000-000000000011");
    store.seed(rule, runtime(rule.id, due));
    const dispatcher = recordingDispatcher();
    const scheduler = new AutomationScheduler({
      workerId: "w-1",
      store,
      dispatcher,
      now: () => due,
      leaseMs: 1,
    });
    await scheduler.tick();
    expect(dispatcher.calls).toBe(0);
    expect(store.runs[0]?.status).toBe("running");
    await scheduler.tick();
    expect(dispatcher.calls).toBe(0);
    expect(store.runs[0]?.status).toBe("unknown");
    expect(store.runs).toHaveLength(1);
  });

  it("records unknown after dispatch if the final write fails, without retrying the action", async () => {
    const store = new MemoryStore();
    store.throwOnFinish = true;
    const due = new Date("2026-09-15T12:00:00.000Z");
    const rule = scheduleRule("00000000-0000-4000-8000-000000000012");
    store.seed(rule, runtime(rule.id, due));
    const dispatcher = recordingDispatcher();
    const later = new Date("2026-09-15T12:02:00.000Z");
    let current = due;
    const scheduler = new AutomationScheduler({
      workerId: "w-1",
      store,
      dispatcher,
      now: () => current,
      leaseMs: 1,
    });
    await scheduler.tick();
    expect(dispatcher.calls).toBe(1);
    expect(store.runs[0]?.status).toBe("running");
    current = later;
    await scheduler.tick();
    expect(dispatcher.calls).toBe(1);
    expect(store.runs[0]?.status).toBe("unknown");
  });

  it("uses unwired dispatcher by default and never invents a side effect", async () => {
    const store = new MemoryStore();
    const due = new Date("2026-09-15T12:00:00.000Z");
    const rule = scheduleRule("00000000-0000-4000-8000-000000000013");
    store.seed(rule, runtime(rule.id, due));
    const scheduler = new AutomationScheduler({
      workerId: "w-1",
      store,
      dispatcher: unwiredAutomationDispatcher(),
      now: () => due,
    });
    await scheduler.tick();
    expect(store.runs[0]?.status).toBe("skipped");
  });

  it("matches an event once and ignores duplicates via runKey", async () => {
    const store = new MemoryStore();
    const rule = eventRule("00000000-0000-4000-8000-000000000014");
    store.seed(rule, runtime(rule.id, null));
    const dispatcher = recordingDispatcher();
    const scheduler = new AutomationScheduler({
      workerId: "w-1",
      store,
      dispatcher,
      now: () => new Date("2026-09-15T12:00:00.000Z"),
    });
    const event = {
      type: "integration.status.changed" as const,
      integrationId: INTEGRATION_ID,
      integrationType: "ntfy",
      status: "unavailable" as const,
      occurredAt: "2026-09-15T12:00:00.000Z",
    };
    await scheduler.handleEvent(event);
    await scheduler.handleEvent(event);
    expect(dispatcher.calls).toBe(1);
    expect(store.runs[0]?.runKey).toBe(buildEventRunKey(rule.id, event));
  });

  it("denies execution when the live owner is disabled", async () => {
    const store = new MemoryStore();
    const due = new Date("2026-09-15T12:00:00.000Z");
    const rule = scheduleRule("00000000-0000-4000-8000-000000000015");
    store.seed(rule, runtime(rule.id, due));
    const dispatcher = recordingDispatcher();
    const scheduler = new AutomationScheduler({
      workerId: "w-1",
      store,
      dispatcher,
      now: () => due,
      async loadOwner() {
        return {
          id: OWNER_ID,
          status: "disabled",
          isSystemAdmin: true,
        };
      },
    });
    await scheduler.tick();
    expect(dispatcher.calls).toBe(0);
    expect(store.runs[0]?.status).toBe("denied");
  });

  it("stops claiming after shutdown", async () => {
    const store = new MemoryStore();
    const due = new Date("2026-09-15T12:00:00.000Z");
    const rule = scheduleRule("00000000-0000-4000-8000-000000000016");
    store.seed(rule, runtime(rule.id, due));
    const dispatcher = recordingDispatcher();
    const scheduler = new AutomationScheduler({
      workerId: "w-1",
      store,
      dispatcher,
      now: () => due,
    });
    await scheduler.stop();
    await scheduler.tick();
    expect(dispatcher.calls).toBe(0);
    expect(store.runs).toHaveLength(0);
    expect(scheduler.health().status).toBe("stopped");
  });

  it("survives a transient DB failure on tick", async () => {
    const store = new MemoryStore();
    store.transientListFailure = true;
    const due = new Date("2026-09-15T12:00:00.000Z");
    const rule = scheduleRule("00000000-0000-4000-8000-000000000017");
    store.seed(rule, runtime(rule.id, due));
    const dispatcher = recordingDispatcher();
    const scheduler = new AutomationScheduler({
      workerId: "w-1",
      store,
      dispatcher,
      now: () => due,
    });
    await scheduler.tick();
    expect(dispatcher.calls).toBe(0);
    await scheduler.tick();
    expect(dispatcher.calls).toBe(1);
  });

  it("seeds nextRunAt for enabled schedules without firing immediately", async () => {
    const store = new MemoryStore();
    const now = new Date("2026-09-15T12:00:00.000Z");
    const rule = scheduleRule("00000000-0000-4000-8000-000000000018");
    store.seed(rule, runtime(rule.id, null));
    const dispatcher = recordingDispatcher();
    const scheduler = new AutomationScheduler({
      workerId: "w-1",
      store,
      dispatcher,
      now: () => now,
    });
    await scheduler.tick();
    expect(dispatcher.calls).toBe(0);
    expect(store.runtimes.get(rule.id)?.nextRunAt?.toISOString()).toBe("2026-09-15T12:15:00.000Z");
  });

  it("does not expose rule config in health snapshots", () => {
    const store = new MemoryStore();
    const scheduler = new AutomationScheduler({
      workerId: "secret-worker",
      store,
      eventIngest: "degraded",
    });
    const body = JSON.stringify(scheduler.health());
    expect(body).not.toMatch(/ntfy.publish|triggerConfig|ownerUserId|secret-worker/u);
    expect(scheduler.health()).toEqual({
      status: "idle",
      lastTickAt: null,
      inFlight: 0,
      eventIngest: "degraded",
    });
  });

  it("keeps lease duration bounded", () => {
    expect(AUTOMATION_LEASE_MS).toBeLessThanOrEqual(60_000);
    expect(AUTOMATION_LEASE_MS).toBeGreaterThanOrEqual(5_000);
  });
});
