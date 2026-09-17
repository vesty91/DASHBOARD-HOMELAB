/**
 * SLO burn-rate alert decisioning (dedup / cooldown / recovery).
 * Side-effect free — callers notify + emit events.
 */

import type { BurnRateState } from "./burn-rate";

export type SloAlertPolicy = {
  id: string;
  sloId: string;
  enabled: boolean;
  warningThreshold: number;
  criticalThreshold: number;
  cooldownSeconds: number;
  notifyOnRecovery: boolean;
  configRevision: number;
  createdAt: Date;
  updatedAt: Date;
};

export type SloAlertRuntimeState = {
  sloId: string;
  lastState: BurnRateState;
  lastNotifiedState: BurnRateState | null;
  lastNotifiedAt: Date | null;
  lastTransitionAt: Date | null;
  lastBurnRate: number | null;
  updatedAt: Date;
};

export type SloAlertDecisionAction =
  "none" | "notify-warning" | "notify-critical" | "notify-recovery" | "record-only";

export type SloAlertDecision = {
  action: SloAlertDecisionAction;
  previousState: BurnRateState | null;
  nextState: BurnRateState;
  shouldNotify: boolean;
  /** True when same alerted state is suppressed by cooldown. */
  cooldownSuppressed: boolean;
  nextRuntime: Omit<SloAlertRuntimeState, "updatedAt"> & { updatedAt?: never };
};

const ALERTING_STATES: ReadonlySet<BurnRateState> = new Set(["warning", "critical"]);

/**
 * Decide whether to notify on a burn-rate evaluation for one policy.
 *
 * Rules:
 * - disabled policies never notify (caller should skip before calling)
 * - insufficient-data never notifies as healthy/warning/critical
 * - warning/critical: notify on transition into that state, or re-notify after cooldown
 * - recovery: healthy only if previous notified state was warning/critical and notifyOnRecovery
 * - same state within cooldown => suppress notification (still record lastState)
 */
export function decideSloAlert(input: {
  sloId: string;
  policy: Pick<SloAlertPolicy, "cooldownSeconds" | "notifyOnRecovery" | "enabled">;
  previous: SloAlertRuntimeState | null;
  nextState: BurnRateState;
  burnRate: number | null;
  nowMs: number;
}): SloAlertDecision {
  const previousState = input.previous?.lastState ?? null;
  const nextState = input.nextState;
  const transitioned = previousState !== nextState;

  const baseRuntime = {
    sloId: input.sloId,
    lastState: nextState,
    lastNotifiedState: input.previous?.lastNotifiedState ?? null,
    lastNotifiedAt: input.previous?.lastNotifiedAt ?? null,
    lastTransitionAt: transitioned
      ? new Date(input.nowMs)
      : (input.previous?.lastTransitionAt ?? new Date(input.nowMs)),
    lastBurnRate: input.burnRate,
  };

  if (!input.policy.enabled) {
    return {
      action: "none",
      previousState,
      nextState,
      shouldNotify: false,
      cooldownSuppressed: false,
      nextRuntime: baseRuntime,
    };
  }

  if (nextState === "insufficient-data") {
    return {
      action: transitioned ? "record-only" : "none",
      previousState,
      nextState,
      shouldNotify: false,
      cooldownSuppressed: false,
      nextRuntime: baseRuntime,
    };
  }

  if (nextState === "healthy") {
    const hadAlert =
      input.previous?.lastNotifiedState === "warning" ||
      input.previous?.lastNotifiedState === "critical";
    if (input.policy.notifyOnRecovery && hadAlert && previousState !== "healthy") {
      return {
        action: "notify-recovery",
        previousState,
        nextState,
        shouldNotify: true,
        cooldownSuppressed: false,
        nextRuntime: {
          ...baseRuntime,
          lastNotifiedState: "healthy",
          lastNotifiedAt: new Date(input.nowMs),
        },
      };
    }
    return {
      action: transitioned ? "record-only" : "none",
      previousState,
      nextState,
      shouldNotify: false,
      cooldownSuppressed: false,
      nextRuntime: baseRuntime,
    };
  }

  // warning | critical
  const sameAsLastNotified = input.previous?.lastNotifiedState === nextState;
  const lastNotifiedMs = input.previous?.lastNotifiedAt?.getTime() ?? null;
  const withinCooldown =
    sameAsLastNotified &&
    lastNotifiedMs !== null &&
    input.nowMs - lastNotifiedMs < input.policy.cooldownSeconds * 1000;

  if (withinCooldown) {
    return {
      action: "none",
      previousState,
      nextState,
      shouldNotify: false,
      cooldownSuppressed: true,
      nextRuntime: baseRuntime,
    };
  }

  // Notify on new severity or after cooldown for same severity.
  const action: SloAlertDecisionAction =
    nextState === "critical" ? "notify-critical" : "notify-warning";

  return {
    action,
    previousState,
    nextState,
    shouldNotify: true,
    cooldownSuppressed: false,
    nextRuntime: {
      ...baseRuntime,
      lastNotifiedState: nextState,
      lastNotifiedAt: new Date(input.nowMs),
    },
  };
}

export function isAlertingState(state: BurnRateState): boolean {
  return ALERTING_STATES.has(state);
}

/** Safe notification title/body fragments — no secrets, URLs, or raw errors. */
export function formatSloAlertNotification(input: {
  action: Exclude<SloAlertDecisionAction, "none" | "record-only">;
  serviceKey: string;
  state: BurnRateState;
  burnRate: number | null;
  windowLabel: string;
}): { title: string; body: string; severity: "warning" | "critical" | "info" } {
  const burn =
    input.burnRate === null || !Number.isFinite(input.burnRate) ? "n/a" : input.burnRate.toFixed(2);
  switch (input.action) {
    case "notify-warning":
      return {
        title: "SLO burn-rate warning",
        body: `Service ${input.serviceKey}: burn-rate ${burn} (${input.windowLabel}) — state warning.`,
        severity: "warning",
      };
    case "notify-critical":
      return {
        title: "SLO burn-rate critical",
        body: `Service ${input.serviceKey}: burn-rate ${burn} (${input.windowLabel}) — state critical.`,
        severity: "critical",
      };
    case "notify-recovery":
      return {
        title: "SLO burn-rate recovered",
        body: `Service ${input.serviceKey}: burn-rate returned to healthy (${input.windowLabel}).`,
        severity: "info",
      };
    default: {
      const _never: never = input.action;
      return _never;
    }
  }
}
