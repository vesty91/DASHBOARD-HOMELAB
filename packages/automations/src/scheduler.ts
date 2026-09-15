import { parseDomainEvent, type DomainEvent } from "@dashboard/events";
import { evaluateAutomationOwner, type AutomationOwnerRecord } from "./access";
import { AutomationError } from "./errors";
import { unwiredAutomationDispatcher, type AutomationActionDispatcher } from "./dispatcher";
import { evaluateAutomationTrigger, type TriggerSkipReason } from "./evaluate";
import { buildEventRunKey, buildScheduleRunKey } from "./run-key";
import { nextScheduleRunAt, parseTriggerConfig, type AutomationStatusValue } from "./triggers";
import type { AutomationActionType, AutomationRunStatus, AutomationTriggerType } from "./types";

export const AUTOMATION_SCHEDULER_SCAN_LIMIT = 100;
export const AUTOMATION_SCHEDULER_MAX_IN_FLIGHT = 4;
export const AUTOMATION_SCHEDULER_MAX_ACTIONS_PER_MINUTE = 30;
export const AUTOMATION_LEASE_MS = 60_000;

export interface AutomationRuleSnapshot {
  id: string;
  enabled: boolean;
  ownerUserId: string | null;
  triggerType: AutomationTriggerType;
  triggerConfigJson: Record<string, unknown>;
  conditionConfigJson: Record<string, unknown> | null;
  actionType: AutomationActionType;
  actionConfigJson: Record<string, unknown>;
  cooldownSeconds: number;
}

export interface AutomationRuntimeSnapshot {
  automationId: string;
  nextRunAt: Date | null;
  lastTriggeredAt: Date | null;
  lastCompletedAt: Date | null;
  lastObservedState: Record<string, unknown> | null;
  failureCount: number;
  leaseOwner: string | null;
  leaseUntil: Date | null;
}

export interface AutomationRunSnapshot {
  id: string;
  automationId: string | null;
  runKey: string;
  status: AutomationRunStatus;
  startedAt: Date;
  finishedAt: Date | null;
}

export interface AutomationRunInsertInput {
  automationId: string;
  runKey: string;
  triggerType: AutomationTriggerType;
  status: AutomationRunStatus;
  scheduledFor?: Date | null;
  startedAt: Date;
  actionType: AutomationActionType;
}

export interface AutomationSchedulerStore {
  getRule(id: string): Promise<AutomationRuleSnapshot | null>;
  getRuntime(id: string): Promise<AutomationRuntimeSnapshot | null>;
  listDueScheduleIds(now: Date, limit: number): Promise<string[]>;
  listUnscheduledScheduleIds(limit: number): Promise<string[]>;
  listEnabledEventRuleIds(limit: number): Promise<string[]>;
  claimLease(input: {
    automationId: string;
    workerId: string;
    now: Date;
    leaseUntil: Date;
  }): Promise<boolean>;
  releaseLease(input: { automationId: string; workerId: string }): Promise<void>;
  updateRuntime(
    automationId: string,
    patch: {
      nextRunAt?: Date | null;
      lastTriggeredAt?: Date | null;
      lastCompletedAt?: Date | null;
      lastObservedState?: Record<string, unknown> | null;
      failureCount?: number;
    },
  ): Promise<void>;
  tryInsertRun(
    input: AutomationRunInsertInput,
  ): Promise<{ run: AutomationRunSnapshot; created: boolean }>;
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

export type AutomationSchedulerHealthStatus = "off" | "idle" | "running" | "stopped";
export type AutomationEventIngestStatus = "off" | "live" | "degraded";

export interface AutomationSchedulerHealth {
  status: AutomationSchedulerHealthStatus;
  lastTickAt: string | null;
  inFlight: number;
  eventIngest: AutomationEventIngestStatus;
}

export interface AutomationSchedulerOptions {
  workerId: string;
  store: AutomationSchedulerStore;
  dispatcher?: AutomationActionDispatcher;
  loadOwner?: (userId: string) => Promise<AutomationOwnerRecord | null>;
  now?: () => Date;
  leaseMs?: number;
  scanLimit?: number;
  maxInFlight?: number;
  maxActionsPerMinute?: number;
  eventIngest?: AutomationEventIngestStatus;
}

function skipErrorCode(reason: TriggerSkipReason): string {
  switch (reason) {
    case "mismatch":
      return "TRIGGER_MISMATCH";
    case "condition_false":
      return "CONDITION_FALSE";
    case "cooldown":
      return "COOLDOWN";
    case "loop":
      return "LOOP";
    case "unknown_event":
      return "UNKNOWN_EVENT";
    default: {
      const _never: never = reason;
      return _never;
    }
  }
}

function readObservedStatus(state: Record<string, unknown> | null): AutomationStatusValue | null {
  const status = state?.status;
  if (status === "unknown" || status === "available" || status === "unavailable") return status;
  return null;
}

function ownerErrorCode(error: unknown): string {
  if (error instanceof AutomationError) return error.code;
  return "DENIED_PERMISSION";
}

class MinuteWindow {
  #times: number[] = [];

  tryConsume(nowMs: number, max: number): boolean {
    const cutoff = nowMs - 60_000;
    this.#times = this.#times.filter((time) => time > cutoff);
    if (this.#times.length >= max) return false;
    this.#times.push(nowMs);
    return true;
  }
}

async function runLimited<T>(
  items: readonly T[],
  limit: number,
  worker: (item: T) => Promise<void>,
): Promise<void> {
  if (items.length === 0) return;
  const queue = [...items];
  const workerCount = Math.min(limit, items.length);
  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      for (;;) {
        const item = queue.shift();
        if (item === undefined) return;
        await worker(item);
      }
    }),
  );
}

export class AutomationScheduler {
  readonly workerId: string;
  readonly store: AutomationSchedulerStore;
  readonly dispatcher: AutomationActionDispatcher;
  readonly loadOwner?: AutomationSchedulerOptions["loadOwner"];
  readonly now: () => Date;
  readonly leaseMs: number;
  readonly scanLimit: number;
  readonly maxInFlight: number;
  readonly maxActionsPerMinute: number;
  #eventIngest: AutomationEventIngestStatus;
  #stopping = false;
  #inFlight = 0;
  #lastTickAt: string | null = null;
  #window = new MinuteWindow();

  constructor(options: AutomationSchedulerOptions) {
    this.workerId = options.workerId;
    this.store = options.store;
    this.dispatcher = options.dispatcher ?? unwiredAutomationDispatcher();
    this.loadOwner = options.loadOwner;
    this.now = options.now ?? (() => new Date());
    this.leaseMs = options.leaseMs ?? AUTOMATION_LEASE_MS;
    this.scanLimit = options.scanLimit ?? AUTOMATION_SCHEDULER_SCAN_LIMIT;
    this.maxInFlight = options.maxInFlight ?? AUTOMATION_SCHEDULER_MAX_IN_FLIGHT;
    this.maxActionsPerMinute =
      options.maxActionsPerMinute ?? AUTOMATION_SCHEDULER_MAX_ACTIONS_PER_MINUTE;
    this.#eventIngest = options.eventIngest ?? "off";
  }

  setEventIngest(status: AutomationEventIngestStatus): void {
    this.#eventIngest = status;
  }

  health(): AutomationSchedulerHealth {
    return {
      status: this.#stopping ? "stopped" : this.#inFlight > 0 ? "running" : "idle",
      lastTickAt: this.#lastTickAt,
      inFlight: this.#inFlight,
      eventIngest: this.#eventIngest,
    };
  }

  async stop(): Promise<void> {
    this.#stopping = true;
    const deadline = Date.now() + 8_000;
    while (this.#inFlight > 0 && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
  }

  async tick(): Promise<void> {
    if (this.#stopping) return;
    const now = this.now();
    this.#lastTickAt = now.toISOString();
    try {
      await this.store.markStaleRunsUnknown(now, this.leaseMs);
      await this.#seedUnscheduled(now);
      const dueIds = await this.store.listDueScheduleIds(now, this.scanLimit);
      await runLimited(dueIds, this.maxInFlight, (id) => this.#processSchedule(id, now));
    } catch {
      void now;
    }
  }

  async handleEvent(raw: unknown): Promise<void> {
    if (this.#stopping) return;
    const event = parseDomainEvent(raw);
    if (!event) return;
    if (
      event.type === "board.updated" ||
      event.type === "board.deleted" ||
      event.type === "job.heartbeat"
    )
      return;
    try {
      const ids = await this.store.listEnabledEventRuleIds(this.scanLimit);
      await runLimited(ids, this.maxInFlight, (id) => this.#processEvent(id, event));
    } catch {
      void event;
    }
  }

  async #seedUnscheduled(now: Date): Promise<void> {
    const ids = await this.store.listUnscheduledScheduleIds(this.scanLimit);
    for (const id of ids) {
      if (this.#stopping) return;
      const rule = await this.store.getRule(id);
      if (!rule || !rule.enabled || rule.triggerType !== "schedule") continue;
      try {
        const parsed = parseTriggerConfig(rule.triggerType, rule.triggerConfigJson);
        if (parsed.triggerType !== "schedule") continue;
        const next = nextScheduleRunAt(parsed.config, now);
        if (next) await this.store.updateRuntime(id, { nextRunAt: next });
      } catch {
        continue;
      }
    }
  }

  async #processSchedule(automationId: string, now: Date): Promise<void> {
    const rule = await this.store.getRule(automationId);
    const runtime = await this.store.getRuntime(automationId);
    if (!rule || !runtime || !rule.enabled || rule.triggerType !== "schedule") return;
    const scheduledFor = runtime.nextRunAt;
    if (!scheduledFor || scheduledFor.getTime() > now.getTime()) return;
    const evaluation = evaluateAutomationTrigger({
      automationId: rule.id,
      triggerType: rule.triggerType,
      triggerConfigJson: rule.triggerConfigJson,
      conditionConfigJson: rule.conditionConfigJson,
      cooldownSeconds: rule.cooldownSeconds,
      lastTriggeredAt: runtime.lastTriggeredAt,
      now,
    });
    if (evaluation.outcome === "skip") return;
    await this.#claimAndDispatch({
      rule,
      runtime,
      now,
      triggerType: "schedule",
      runKey: buildScheduleRunKey(rule.id, scheduledFor),
      scheduledFor,
      bumpNextRun: true,
    });
  }

  async #processEvent(automationId: string, event: DomainEvent): Promise<void> {
    const rule = await this.store.getRule(automationId);
    const runtime = await this.store.getRuntime(automationId);
    if (!rule || !runtime || !rule.enabled) return;
    if (rule.triggerType !== "event" && rule.triggerType !== "status-transition") return;
    const now = this.now();
    if (rule.triggerType === "status-transition") {
      const claimed = await this.store.claimLease({
        automationId: rule.id,
        workerId: this.workerId,
        now,
        leaseUntil: new Date(now.getTime() + this.leaseMs),
      });
      if (!claimed) return;
      try {
        const fresh = await this.store.getRuntime(rule.id);
        const evaluation = evaluateAutomationTrigger({
          automationId: rule.id,
          triggerType: rule.triggerType,
          triggerConfigJson: rule.triggerConfigJson,
          conditionConfigJson: rule.conditionConfigJson,
          cooldownSeconds: rule.cooldownSeconds,
          lastTriggeredAt: fresh?.lastTriggeredAt ?? runtime.lastTriggeredAt,
          lastObservedStatus: readObservedStatus(
            fresh?.lastObservedState ?? runtime.lastObservedState,
          ),
          now,
          event,
        });
        if (event.type === "integration.status.changed") {
          await this.store.updateRuntime(rule.id, { lastObservedState: { status: event.status } });
        }
        if (evaluation.outcome === "skip") return;
        await this.#claimAndDispatch({
          rule,
          runtime: fresh ?? runtime,
          now,
          triggerType: rule.triggerType,
          runKey: buildEventRunKey(rule.id, event),
          scheduledFor: null,
          bumpNextRun: false,
          alreadyClaimed: true,
        });
      } finally {
        await this.store.releaseLease({ automationId: rule.id, workerId: this.workerId });
      }
      return;
    }
    const evaluation = evaluateAutomationTrigger({
      automationId: rule.id,
      triggerType: rule.triggerType,
      triggerConfigJson: rule.triggerConfigJson,
      conditionConfigJson: rule.conditionConfigJson,
      cooldownSeconds: rule.cooldownSeconds,
      lastTriggeredAt: runtime.lastTriggeredAt,
      lastObservedStatus: readObservedStatus(runtime.lastObservedState),
      now,
      event,
    });
    if (evaluation.outcome === "skip") return;
    await this.#claimAndDispatch({
      rule,
      runtime,
      now,
      triggerType: rule.triggerType,
      runKey: buildEventRunKey(rule.id, event),
      scheduledFor: null,
      bumpNextRun: false,
    });
  }

  async #claimAndDispatch(input: {
    rule: AutomationRuleSnapshot;
    runtime: AutomationRuntimeSnapshot;
    now: Date;
    triggerType: AutomationTriggerType;
    runKey: string;
    scheduledFor: Date | null;
    bumpNextRun: boolean;
    alreadyClaimed?: boolean;
  }): Promise<void> {
    if (this.#stopping) return;
    this.#inFlight += 1;
    const leaseUntil = new Date(input.now.getTime() + this.leaseMs);
    try {
      const claimed =
        input.alreadyClaimed === true
          ? true
          : await this.store.claimLease({
              automationId: input.rule.id,
              workerId: this.workerId,
              now: input.now,
              leaseUntil,
            });
      if (!claimed) return;
      const insert: AutomationRunInsertInput = {
        automationId: input.rule.id,
        runKey: input.runKey,
        triggerType: input.triggerType,
        status: "running",
        startedAt: input.now,
        actionType: input.rule.actionType,
      };
      if (input.scheduledFor) insert.scheduledFor = input.scheduledFor;
      const inserted = await this.store.tryInsertRun(insert);
      if (!inserted.created) {
        if (inserted.run.status === "running" || inserted.run.status === "scheduled") {
          await this.store.finishRun({
            runId: inserted.run.id,
            status: "unknown",
            finishedAt: this.now(),
            errorCode: "STALE_RUN",
          });
        }
        if (input.bumpNextRun) {
          try {
            await this.#advanceSchedule(input.rule, input.now);
          } catch {
            void input.rule;
          }
        }
        await this.store.releaseLease({
          automationId: input.rule.id,
          workerId: this.workerId,
        });
        return;
      }
      if (input.bumpNextRun) {
        try {
          await this.#advanceSchedule(input.rule, input.now);
        } catch {
          await this.store.releaseLease({
            automationId: input.rule.id,
            workerId: this.workerId,
          });
          return;
        }
      }
      const authorized = await this.#authorize(input.rule);
      if (!authorized.ok) {
        await this.#complete({
          rule: input.rule,
          runId: inserted.run.id,
          now: this.now(),
          status: "denied",
          errorCode: authorized.errorCode,
        });
        return;
      }
      if (!this.#window.tryConsume(input.now.getTime(), this.maxActionsPerMinute)) {
        await this.#complete({
          rule: input.rule,
          runId: inserted.run.id,
          now: this.now(),
          status: "skipped",
          errorCode: "RATE_LIMITED",
        });
        return;
      }
      if (this.#stopping) {
        await this.#complete({
          rule: input.rule,
          runId: inserted.run.id,
          now: this.now(),
          status: "unknown",
          errorCode: "SHUTTING_DOWN",
        });
        return;
      }
      let dispatched;
      try {
        dispatched = await this.dispatcher.dispatch({
          runId: inserted.run.id,
          automationId: input.rule.id,
          actionType: input.rule.actionType,
          actionConfigJson: input.rule.actionConfigJson,
          triggerType: input.triggerType,
        });
      } catch {
        try {
          await this.#complete({
            rule: input.rule,
            runId: inserted.run.id,
            now: this.now(),
            status: "unknown",
            errorCode: "DISPATCH_UNKNOWN",
          });
        } catch {
          void inserted.run.id;
        }
        return;
      }
      try {
        await this.#complete({
          rule: input.rule,
          runId: inserted.run.id,
          now: this.now(),
          status: dispatched.status,
          errorCode: dispatched.errorCode ?? null,
          resourceId: dispatched.resourceId ?? null,
          summaryJson: dispatched.summaryJson ?? null,
        });
      } catch {
        void dispatched;
      }
    } finally {
      this.#inFlight = Math.max(0, this.#inFlight - 1);
    }
  }

  async #advanceSchedule(rule: AutomationRuleSnapshot, from: Date): Promise<void> {
    let next: Date | null = new Date(from.getTime() + 60_000);
    try {
      const parsed = parseTriggerConfig(rule.triggerType, rule.triggerConfigJson);
      if (parsed.triggerType !== "schedule") return;
      next = nextScheduleRunAt(parsed.config, from);
    } catch {
      next = new Date(from.getTime() + 60_000);
    }
    await this.store.updateRuntime(rule.id, { nextRunAt: next });
  }

  async #authorize(
    rule: AutomationRuleSnapshot,
  ): Promise<{ ok: true } | { ok: false; errorCode: string }> {
    if (!this.loadOwner) return { ok: true };
    try {
      const owner = rule.ownerUserId ? await this.loadOwner(rule.ownerUserId) : null;
      evaluateAutomationOwner(owner, "run");
      return { ok: true };
    } catch (error) {
      return { ok: false, errorCode: ownerErrorCode(error) };
    }
  }

  async #complete(input: {
    rule: AutomationRuleSnapshot;
    runId: string;
    now: Date;
    status: AutomationRunStatus;
    errorCode?: string | null;
    resourceId?: string | null;
    summaryJson?: Record<string, unknown> | null;
  }): Promise<void> {
    const finish: {
      runId: string;
      status: AutomationRunStatus;
      finishedAt: Date;
      errorCode?: string | null;
      resourceId?: string | null;
      summaryJson?: Record<string, unknown> | null;
    } = {
      runId: input.runId,
      status: input.status,
      finishedAt: input.now,
    };
    if (input.errorCode !== undefined) finish.errorCode = input.errorCode;
    if (input.resourceId !== undefined) finish.resourceId = input.resourceId;
    if (input.summaryJson !== undefined) finish.summaryJson = input.summaryJson;
    await this.store.finishRun(finish);
    const failed = input.status === "failed" || input.status === "unknown";
    const runtime = await this.store.getRuntime(input.rule.id);
    await this.store.updateRuntime(input.rule.id, {
      lastTriggeredAt: input.now,
      lastCompletedAt: input.now,
      failureCount: failed ? (runtime?.failureCount ?? 0) + 1 : 0,
    });
    await this.store.releaseLease({
      automationId: input.rule.id,
      workerId: this.workerId,
    });
  }
}

export function skipReasonErrorCode(reason: TriggerSkipReason): string {
  return skipErrorCode(reason);
}

export function createAutomationScheduler(
  options: AutomationSchedulerOptions,
): AutomationScheduler {
  return new AutomationScheduler(options);
}
