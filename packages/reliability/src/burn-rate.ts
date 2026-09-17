/**
 * Multi-window SLO burn-rate engine (closed windows only).
 *
 * Definitions (Phase 27):
 *   errorBudgetFraction = (100_000 - objectiveBps) / 100_000
 *   badFraction         = consumed / eligible   (Phase 26 unknown/maintenance policy)
 *   burnRate            = badFraction / errorBudgetFraction
 *
 * Closed windows: 1h, 6h, 24h, 3d. Current (open) hour is excluded.
 * Paired fast/slow burn uses AND semantics.
 * Zero eligible data => insufficient-data (never "healthy").
 */

import { MS_PER_HOUR, utcHourString } from "./aggregation";
import { assertObjectiveBasisPoints, type DailyBucketInput } from "./slo-math";

/** Closed burn-rate window lengths in hours. */
export const BURN_RATE_WINDOWS_HOURS = [1, 6, 24, 72] as const;
export type BurnRateWindowHours = (typeof BURN_RATE_WINDOWS_HOURS)[number];

export const BURN_RATE_WINDOW_LABELS = {
  1: "1h",
  6: "6h",
  24: "24h",
  72: "3d",
} as const satisfies Record<BurnRateWindowHours, string>;

export type BurnRateState = "healthy" | "warning" | "critical" | "insufficient-data";

/** Default Google-style multi-window pairs (AND). */
export const DEFAULT_BURN_PAIRS = {
  /** Fast: 1h AND 6h — short-window acute burn. */
  fast: { shortHours: 1, longHours: 6 } as const,
  /** Slow: 24h AND 3d — sustained burn. */
  slow: { shortHours: 24, longHours: 72 } as const,
} as const;

export type HourlyBucketInput = DailyBucketInput;

export type BurnRateWindowResult = {
  windowHours: BurnRateWindowHours;
  windowLabel: (typeof BURN_RATE_WINDOW_LABELS)[BurnRateWindowHours];
  observedSeconds: number;
  eligibleSeconds: number;
  availableSeconds: number;
  degradedSeconds: number;
  unavailableSeconds: number;
  maintenanceSeconds: number;
  unknownSeconds: number;
  consumedDowntimeSeconds: number;
  /** null when insufficient data or pathological budget. */
  burnRate: number | null;
  badFraction: number | null;
  errorBudgetFraction: number;
  /** Remaining budget fraction for this window (1 = full, 0 = exhausted). */
  budgetRemainingFraction: number | null;
  zeroObservations: boolean;
};

export type BurnRatePairResult = {
  pair: "fast" | "slow";
  short: BurnRateWindowResult;
  long: BurnRateWindowResult;
  /** AND of short+long burn against thresholds; insufficient if either lacks data. */
  state: BurnRateState;
  /** Max burn of the two windows when both have data; null otherwise. */
  burnRate: number | null;
};

export type BurnRateEvaluation = {
  objectiveBasisPoints: number;
  excludeMaintenance: boolean;
  windows: BurnRateWindowResult[];
  pairs: {
    fast: BurnRatePairResult;
    slow: BurnRatePairResult;
  };
  /**
   * Overall state: critical if any pair critical; else warning if any warning;
   * else healthy only if all pairs healthy; else insufficient-data.
   */
  state: BurnRateState;
};

function isBurnRateWindowHours(value: number): value is BurnRateWindowHours {
  return (BURN_RATE_WINDOWS_HOURS as readonly number[]).includes(value);
}

/**
 * Aggregate Phase-26-compatible buckets into burn-rate inputs.
 * Degraded counts against availability; unknown excluded; maintenance optional.
 */
export function aggregateBucketsForBurn(input: {
  hours: readonly HourlyBucketInput[];
  excludeMaintenance: boolean;
}): {
  observedSeconds: number;
  eligibleSeconds: number;
  availableSeconds: number;
  degradedSeconds: number;
  unavailableSeconds: number;
  maintenanceSeconds: number;
  unknownSeconds: number;
  consumedDowntimeSeconds: number;
  zeroObservations: boolean;
} {
  let observedSeconds = 0;
  let availableSeconds = 0;
  let degradedSeconds = 0;
  let unavailableSeconds = 0;
  let maintenanceSeconds = 0;
  let unknownSeconds = 0;

  for (const hour of input.hours) {
    observedSeconds += hour.observedSeconds;
    availableSeconds += hour.availableSeconds;
    degradedSeconds += hour.degradedSeconds;
    unavailableSeconds += hour.unavailableSeconds;
    maintenanceSeconds += hour.maintenanceSeconds;
    unknownSeconds += hour.unknownSeconds;
  }

  const maintenanceExcluded = input.excludeMaintenance ? maintenanceSeconds : 0;
  const eligibleSeconds = Math.max(0, observedSeconds - unknownSeconds - maintenanceExcluded);
  const goodSeconds = availableSeconds;
  const consumedDowntimeSeconds = Math.max(0, eligibleSeconds - goodSeconds);
  const zeroObservations = eligibleSeconds === 0;

  return {
    observedSeconds,
    eligibleSeconds,
    availableSeconds,
    degradedSeconds,
    unavailableSeconds,
    maintenanceSeconds,
    unknownSeconds,
    consumedDowntimeSeconds,
    zeroObservations,
  };
}

/**
 * Burn rate for one closed window.
 * burnRate = (consumed/eligible) / ((100000-objective)/100000)
 *          = consumed * 100000 / (eligible * (100000 - objective))
 *
 * Uses integer-friendly math then converts to finite number (capped).
 */
export function computeBurnRateForWindow(input: {
  hours: readonly HourlyBucketInput[];
  windowHours: BurnRateWindowHours;
  objectiveBasisPoints: number;
  excludeMaintenance: boolean;
}): BurnRateWindowResult {
  assertObjectiveBasisPoints(input.objectiveBasisPoints);
  if (!isBurnRateWindowHours(input.windowHours)) {
    throw new Error(`BURN_RATE_WINDOW_INVALID:${input.windowHours}`);
  }

  const agg = aggregateBucketsForBurn({
    hours: input.hours,
    excludeMaintenance: input.excludeMaintenance,
  });

  const errorBudgetBps = 100_000 - input.objectiveBasisPoints;
  const errorBudgetFraction = errorBudgetBps / 100_000;

  if (agg.zeroObservations) {
    return {
      windowHours: input.windowHours,
      windowLabel: BURN_RATE_WINDOW_LABELS[input.windowHours],
      ...agg,
      burnRate: null,
      badFraction: null,
      errorBudgetFraction,
      budgetRemainingFraction: null,
    };
  }

  const badFraction = agg.consumedDowntimeSeconds / agg.eligibleSeconds;
  // burnRate = badFraction / errorBudgetFraction
  const burnRate = badFraction / errorBudgetFraction;

  const allowedDowntime = Math.floor((agg.eligibleSeconds * errorBudgetBps) / 100_000);
  const remaining =
    allowedDowntime === 0
      ? agg.consumedDowntimeSeconds === 0
        ? 1
        : 0
      : Math.max(0, allowedDowntime - agg.consumedDowntimeSeconds) / allowedDowntime;

  return {
    windowHours: input.windowHours,
    windowLabel: BURN_RATE_WINDOW_LABELS[input.windowHours],
    ...agg,
    burnRate: Number.isFinite(burnRate) ? burnRate : null,
    badFraction,
    errorBudgetFraction,
    budgetRemainingFraction: remaining,
  };
}

export function classifyBurnAgainstThresholds(input: {
  burnRate: number | null;
  zeroObservations: boolean;
  warningThreshold: number;
  criticalThreshold: number;
}): BurnRateState {
  if (input.zeroObservations || input.burnRate === null) {
    return "insufficient-data";
  }
  if (input.burnRate >= input.criticalThreshold) {
    return "critical";
  }
  if (input.burnRate >= input.warningThreshold) {
    return "warning";
  }
  return "healthy";
}

/**
 * AND semantics: both windows must meet the threshold for warning/critical.
 * Either insufficient => insufficient-data.
 * Severity is the min severity that BOTH windows satisfy.
 */
export function classifyBurnPair(input: {
  short: BurnRateWindowResult;
  long: BurnRateWindowResult;
  warningThreshold: number;
  criticalThreshold: number;
}): BurnRateState {
  if (input.short.zeroObservations || input.long.zeroObservations) {
    return "insufficient-data";
  }
  if (input.short.burnRate === null || input.long.burnRate === null) {
    return "insufficient-data";
  }

  const shortCritical = input.short.burnRate >= input.criticalThreshold;
  const longCritical = input.long.burnRate >= input.criticalThreshold;
  if (shortCritical && longCritical) {
    return "critical";
  }

  const shortWarning = input.short.burnRate >= input.warningThreshold;
  const longWarning = input.long.burnRate >= input.warningThreshold;
  if (shortWarning && longWarning) {
    return "warning";
  }

  return "healthy";
}

function mergeOverallState(fast: BurnRateState, slow: BurnRateState): BurnRateState {
  if (fast === "critical" || slow === "critical") return "critical";
  if (fast === "warning" || slow === "warning") return "warning";
  if (fast === "healthy" && slow === "healthy") return "healthy";
  if (fast === "healthy" || slow === "healthy") {
    // One healthy + one insufficient => insufficient (never claim healthy on partial data)
    if (fast === "insufficient-data" || slow === "insufficient-data") {
      return "insufficient-data";
    }
  }
  return "insufficient-data";
}

/**
 * Evaluate burn rate across all closed windows and default fast/slow pairs.
 *
 * `hoursByWindow` maps window hours → hourly buckets for that closed window
 * (caller supplies exact closed-hour slices; engine does not open current hour).
 */
/** Default warning: burning ≥1× error budget rate. */
export const DEFAULT_BURN_WARNING_THRESHOLD = 1;
/** Default critical: Google-style fast page threshold (14.4×). */
export const DEFAULT_BURN_CRITICAL_THRESHOLD = 14.4;

export function evaluateBurnRate(input: {
  hoursByWindow: Readonly<Partial<Record<BurnRateWindowHours, readonly HourlyBucketInput[]>>>;
  objectiveBasisPoints: number;
  excludeMaintenance: boolean;
  warningThreshold?: number;
  criticalThreshold?: number;
}): BurnRateEvaluation {
  assertObjectiveBasisPoints(input.objectiveBasisPoints);

  const warningThreshold = input.warningThreshold ?? DEFAULT_BURN_WARNING_THRESHOLD;
  const criticalThreshold = input.criticalThreshold ?? DEFAULT_BURN_CRITICAL_THRESHOLD;
  if (
    !(warningThreshold > 0) ||
    !(criticalThreshold > 0) ||
    !(criticalThreshold > warningThreshold)
  ) {
    throw new Error(
      `BURN_RATE_THRESHOLDS_INVALID:warning=${warningThreshold},critical=${criticalThreshold}`,
    );
  }

  const windows: BurnRateWindowResult[] = [];
  for (const windowHours of BURN_RATE_WINDOWS_HOURS) {
    const hours = input.hoursByWindow[windowHours] ?? [];
    windows.push(
      computeBurnRateForWindow({
        hours,
        windowHours,
        objectiveBasisPoints: input.objectiveBasisPoints,
        excludeMaintenance: input.excludeMaintenance,
      }),
    );
  }

  const byHours = new Map(windows.map((w) => [w.windowHours, w]));

  function pairResult(
    pair: "fast" | "slow",
    shortHours: BurnRateWindowHours,
    longHours: BurnRateWindowHours,
  ): BurnRatePairResult {
    const short = byHours.get(shortHours)!;
    const long = byHours.get(longHours)!;
    const state = classifyBurnPair({
      short,
      long,
      warningThreshold,
      criticalThreshold,
    });
    const burnRate =
      short.burnRate !== null && long.burnRate !== null
        ? Math.max(short.burnRate, long.burnRate)
        : null;
    return { pair, short, long, state, burnRate };
  }

  const fast = pairResult("fast", 1, 6);
  const slow = pairResult("slow", 24, 72);

  return {
    objectiveBasisPoints: input.objectiveBasisPoints,
    excludeMaintenance: input.excludeMaintenance,
    windows,
    pairs: { fast, slow },
    state: mergeOverallState(fast.state, slow.state),
  };
}

/**
 * Closed UTC hours ending at `asOfMs` (exclusive of the current open hour).
 * Returns hourUtc strings `YYYY-MM-DDTHH` for the last `windowHours` closed hours.
 */
export function listClosedUtcHours(input: { asOfMs: number; windowHours: number }): string[] {
  if (!Number.isInteger(input.windowHours) || input.windowHours < 1 || input.windowHours > 168) {
    throw new Error(`BURN_RATE_CLOSED_HOURS_INVALID:${input.windowHours}`);
  }
  const currentHourStart = Math.floor(input.asOfMs / MS_PER_HOUR) * MS_PER_HOUR;
  const lastClosedStart = currentHourStart - MS_PER_HOUR;
  const hours: string[] = [];
  for (let i = input.windowHours - 1; i >= 0; i--) {
    hours.push(utcHourString(lastClosedStart - i * MS_PER_HOUR));
  }
  return hours;
}
