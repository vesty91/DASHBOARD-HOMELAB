/**
 * SLO availability and error-budget math (integer basis points).
 *
 * Availability (excludeMaintenance=true):
 *   eligible = observed - maintenance - unknown
 *   availableForSlo = available
 *   availabilityBps = floor(availableForSlo * 100_000 / eligible) when eligible > 0
 *
 * Unknown is excluded from numerator and denominator (surfaced separately).
 * Degraded counts as unavailable for SLO (conservative).
 *
 * When excludeMaintenance=false, maintenance seconds stay in the denominator
 * and are not counted as available.
 */

export const SLO_WINDOW_DAYS = [7, 30, 90] as const;
export type SloWindowDays = (typeof SLO_WINDOW_DAYS)[number];

/** 90.000% .. 99.999% — 100% rejected (pathological error budget). */
export const SLO_OBJECTIVE_BPS_MIN = 90_000;
export const SLO_OBJECTIVE_BPS_MAX = 99_999;

export type DailyBucketInput = {
  observedSeconds: number;
  availableSeconds: number;
  degradedSeconds: number;
  unavailableSeconds: number;
  maintenanceSeconds: number;
  unknownSeconds: number;
};

export type SloComputation = {
  windowDays: SloWindowDays;
  objectiveBasisPoints: number;
  observedSeconds: number;
  eligibleSeconds: number;
  availableSeconds: number;
  degradedSeconds: number;
  unavailableSeconds: number;
  maintenanceSeconds: number;
  unknownSeconds: number;
  availabilityBasisPoints: number | null;
  allowedDowntimeSeconds: number | null;
  consumedDowntimeSeconds: number;
  remainingDowntimeSeconds: number | null;
  remainingBudgetBasisPoints: number | null;
  zeroObservations: boolean;
};

export function isSloWindowDays(value: number): value is SloWindowDays {
  return (SLO_WINDOW_DAYS as readonly number[]).includes(value);
}

export function assertObjectiveBasisPoints(value: number): void {
  if (!Number.isInteger(value) || value < SLO_OBJECTIVE_BPS_MIN || value > SLO_OBJECTIVE_BPS_MAX) {
    throw new Error(`SLO_OBJECTIVE_OUT_OF_RANGE:${value}`);
  }
}

export function computeSloFromDaily(input: {
  days: readonly DailyBucketInput[];
  windowDays: SloWindowDays;
  objectiveBasisPoints: number;
  excludeMaintenance: boolean;
}): SloComputation {
  assertObjectiveBasisPoints(input.objectiveBasisPoints);

  let observedSeconds = 0;
  let availableSeconds = 0;
  let degradedSeconds = 0;
  let unavailableSeconds = 0;
  let maintenanceSeconds = 0;
  let unknownSeconds = 0;

  for (const day of input.days) {
    observedSeconds += day.observedSeconds;
    availableSeconds += day.availableSeconds;
    degradedSeconds += day.degradedSeconds;
    unavailableSeconds += day.unavailableSeconds;
    maintenanceSeconds += day.maintenanceSeconds;
    unknownSeconds += day.unknownSeconds;
  }

  const maintenanceExcluded = input.excludeMaintenance ? maintenanceSeconds : 0;
  const eligibleSeconds = Math.max(0, observedSeconds - unknownSeconds - maintenanceExcluded);

  // Degraded counts against availability for SLO.
  const goodSeconds = availableSeconds;
  const consumedDowntimeSeconds = Math.max(0, eligibleSeconds - goodSeconds);

  const zeroObservations = eligibleSeconds === 0;
  const availabilityBasisPoints = zeroObservations
    ? null
    : Math.floor((goodSeconds * 100_000) / eligibleSeconds);

  const allowedDowntimeSeconds = zeroObservations
    ? null
    : Math.floor((eligibleSeconds * (100_000 - input.objectiveBasisPoints)) / 100_000);

  const remainingDowntimeSeconds =
    allowedDowntimeSeconds === null
      ? null
      : Math.max(0, allowedDowntimeSeconds - consumedDowntimeSeconds);

  const remainingBudgetBasisPoints =
    allowedDowntimeSeconds === null || allowedDowntimeSeconds === 0
      ? allowedDowntimeSeconds === 0
        ? consumedDowntimeSeconds === 0
          ? 100_000
          : 0
        : null
      : Math.floor((remainingDowntimeSeconds! * 100_000) / allowedDowntimeSeconds);

  return {
    windowDays: input.windowDays,
    objectiveBasisPoints: input.objectiveBasisPoints,
    observedSeconds,
    eligibleSeconds,
    availableSeconds,
    degradedSeconds,
    unavailableSeconds,
    maintenanceSeconds,
    unknownSeconds,
    availabilityBasisPoints,
    allowedDowntimeSeconds,
    consumedDowntimeSeconds,
    remainingDowntimeSeconds,
    remainingBudgetBasisPoints,
    zeroObservations,
  };
}
