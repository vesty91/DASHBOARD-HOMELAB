import type {
  DailyReliabilityRollup,
  HourlyReliabilityRollup,
  IncidentIntervalInput,
  MaintenanceIntervalInput,
  ReliabilityBucket,
  ServicePresence,
} from "./types";

export const RELIABILITY_RETENTION_DAYS = 730;
export const RELIABILITY_HOURLY_RETENTION_HOURS = 2160;
export const RELIABILITY_REBUILD_DEFAULT_DAYS = 7;
export const RELIABILITY_REBUILD_MAX_DAYS = 90;
export const RELIABILITY_REBUILD_DEFAULT_HOURS = 48;
export const MS_PER_DAY = 86_400_000;
export const MS_PER_HOUR = 3_600_000;

/** Bucket precedence (highest first). Mutually exclusive accounting. */
export const BUCKET_PRECEDENCE: readonly ReliabilityBucket[] = [
  "maintenance",
  "unavailable",
  "degraded",
  "available",
  "unknown",
] as const;

const PRECEDENCE_RANK: Record<ReliabilityBucket, number> = {
  maintenance: 0,
  unavailable: 1,
  degraded: 2,
  available: 3,
  unknown: 4,
};

export function utcDateString(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export function utcHourString(ms: number): string {
  return new Date(ms).toISOString().slice(0, 13);
}

export function utcDayStartMs(dateUtc: string): number {
  const parsed = Date.parse(`${dateUtc}T00:00:00.000Z`);
  if (Number.isNaN(parsed)) throw new Error(`INVALID_UTC_DATE:${dateUtc}`);
  return parsed;
}

export function utcDayEndMs(dateUtc: string): number {
  return utcDayStartMs(dateUtc) + MS_PER_DAY;
}

export function utcHourStartMs(hourUtc: string): number {
  const parsed = Date.parse(`${hourUtc}:00:00.000Z`);
  if (Number.isNaN(parsed)) throw new Error(`INVALID_UTC_HOUR:${hourUtc}`);
  return parsed;
}

export function utcHourEndMs(hourUtc: string): number {
  return utcHourStartMs(hourUtc) + MS_PER_HOUR;
}

export function listUtcDatesInclusive(fromDateUtc: string, toDateUtc: string): string[] {
  const start = utcDayStartMs(fromDateUtc);
  const end = utcDayStartMs(toDateUtc);
  if (end < start) return [];
  const dates: string[] = [];
  for (let cursor = start; cursor <= end; cursor += MS_PER_DAY) {
    dates.push(utcDateString(cursor));
  }
  return dates;
}

export function listUtcHoursInclusive(fromHourUtc: string, toHourUtc: string): string[] {
  const start = utcHourStartMs(fromHourUtc);
  const end = utcHourStartMs(toHourUtc);
  if (end < start) return [];
  const hours: string[] = [];
  for (let cursor = start; cursor <= end; cursor += MS_PER_HOUR) {
    hours.push(utcHourString(cursor));
  }
  return hours;
}

export function clampRebuildDays(days: number): number {
  if (!Number.isFinite(days) || days < 1) return RELIABILITY_REBUILD_DEFAULT_DAYS;
  return Math.min(Math.floor(days), RELIABILITY_REBUILD_MAX_DAYS);
}

function emptyBuckets() {
  return {
    availableSeconds: 0,
    degradedSeconds: 0,
    unavailableSeconds: 0,
    maintenanceSeconds: 0,
    unknownSeconds: 0,
  };
}

function addBucket(
  buckets: ReturnType<typeof emptyBuckets>,
  bucket: ReliabilityBucket,
  seconds: number,
): void {
  if (seconds <= 0) return;
  switch (bucket) {
    case "available":
      buckets.availableSeconds += seconds;
      break;
    case "degraded":
      buckets.degradedSeconds += seconds;
      break;
    case "unavailable":
      buckets.unavailableSeconds += seconds;
      break;
    case "maintenance":
      buckets.maintenanceSeconds += seconds;
      break;
    case "unknown":
      buckets.unknownSeconds += seconds;
      break;
    default: {
      const _exhaustive: never = bucket;
      void _exhaustive;
      break;
    }
  }
}

function prefer(a: ReliabilityBucket, b: ReliabilityBucket): ReliabilityBucket {
  return PRECEDENCE_RANK[a] <= PRECEDENCE_RANK[b] ? a : b;
}

type Segment = { startMs: number; endMs: number; bucket: ReliabilityBucket };

type WindowBucketInput = {
  windowStartMs: number;
  windowEndExclusiveMs: number;
  nowMs: number;
  observableFromMs: number;
  incidents: readonly { startsAtMs: number; endsAtMs: number }[];
  maintenances: readonly { startsAtMs: number; endsAtMs: number }[];
};

/**
 * Paint intervals onto a time window with mutual-exclusion precedence.
 * Baseline for an observable service is `available`; before observability is `unknown`.
 */
export function accountWindowBuckets(input: WindowBucketInput): {
  observedSeconds: number;
  availableSeconds: number;
  degradedSeconds: number;
  unavailableSeconds: number;
  maintenanceSeconds: number;
  unknownSeconds: number;
} {
  const windowStart = input.windowStartMs;
  const windowEndExclusive = Math.min(input.windowEndExclusiveMs, input.nowMs);
  if (windowEndExclusive <= windowStart) {
    return { observedSeconds: 0, ...emptyBuckets() };
  }

  const cuts = new Set<number>([windowStart, windowEndExclusive]);
  const observableStart = Math.max(
    windowStart,
    Math.min(windowEndExclusive, input.observableFromMs),
  );
  cuts.add(observableStart);

  for (const interval of input.incidents) {
    const start = Math.max(windowStart, interval.startsAtMs);
    const end = Math.min(windowEndExclusive, interval.endsAtMs);
    if (end > start) {
      cuts.add(start);
      cuts.add(end);
    }
  }
  for (const interval of input.maintenances) {
    const start = Math.max(windowStart, interval.startsAtMs);
    const end = Math.min(windowEndExclusive, interval.endsAtMs);
    if (end > start) {
      cuts.add(start);
      cuts.add(end);
    }
  }

  const points = [...cuts].sort((a, b) => a - b);
  const buckets = emptyBuckets();
  let observedSeconds = 0;

  for (let i = 0; i < points.length - 1; i += 1) {
    const start = points[i]!;
    const end = points[i + 1]!;
    if (end <= start || start < windowStart || end > windowEndExclusive) continue;
    const mid = start + (end - start) / 2;
    let bucket: ReliabilityBucket = mid < input.observableFromMs ? "unknown" : "available";

    for (const interval of input.incidents) {
      if (mid >= interval.startsAtMs && mid < interval.endsAtMs) {
        bucket = prefer(bucket, "unavailable");
      }
    }
    for (const interval of input.maintenances) {
      if (mid >= interval.startsAtMs && mid < interval.endsAtMs) {
        bucket = prefer(bucket, "maintenance");
      }
    }

    const seconds = Math.floor((end - start) / 1000);
    observedSeconds += seconds;
    addBucket(buckets, bucket, seconds);
  }

  return { observedSeconds, ...buckets };
}

/**
 * Paint intervals onto a day window with mutual-exclusion precedence.
 */
export function accountDayBuckets(input: {
  dateUtc: string;
  nowMs: number;
  observableFromMs: number;
  incidents: readonly { startsAtMs: number; endsAtMs: number }[];
  maintenances: readonly { startsAtMs: number; endsAtMs: number }[];
}): ReturnType<typeof accountWindowBuckets> {
  return accountWindowBuckets({
    windowStartMs: utcDayStartMs(input.dateUtc),
    windowEndExclusiveMs: utcDayEndMs(input.dateUtc),
    nowMs: input.nowMs,
    observableFromMs: input.observableFromMs,
    incidents: input.incidents,
    maintenances: input.maintenances,
  });
}

export function accountHourBuckets(input: {
  hourUtc: string;
  nowMs: number;
  observableFromMs: number;
  incidents: readonly { startsAtMs: number; endsAtMs: number }[];
  maintenances: readonly { startsAtMs: number; endsAtMs: number }[];
}): ReturnType<typeof accountWindowBuckets> {
  return accountWindowBuckets({
    windowStartMs: utcHourStartMs(input.hourUtc),
    windowEndExclusiveMs: utcHourEndMs(input.hourUtc),
    nowMs: input.nowMs,
    observableFromMs: input.observableFromMs,
    incidents: input.incidents,
    maintenances: input.maintenances,
  });
}

export function countIncidentsTouchingDay(
  dateUtc: string,
  incidents: readonly IncidentIntervalInput[],
  serviceKey: string,
): number {
  const dayStart = utcDayStartMs(dateUtc);
  const dayEnd = utcDayEndMs(dateUtc);
  const ids = new Set<string>();
  for (const incident of incidents) {
    if (incident.serviceKey !== serviceKey) continue;
    const end = incident.resolvedAtMs ?? Number.POSITIVE_INFINITY;
    if (incident.openedAtMs < dayEnd && end > dayStart) ids.add(incident.id);
  }
  return ids.size;
}

export function countIncidentsTouchingHour(
  hourUtc: string,
  incidents: readonly IncidentIntervalInput[],
  serviceKey: string,
): number {
  const hourStart = utcHourStartMs(hourUtc);
  const hourEnd = utcHourEndMs(hourUtc);
  const ids = new Set<string>();
  for (const incident of incidents) {
    if (incident.serviceKey !== serviceKey) continue;
    const end = incident.resolvedAtMs ?? Number.POSITIVE_INFINITY;
    if (incident.openedAtMs < hourEnd && end > hourStart) ids.add(incident.id);
  }
  return ids.size;
}

export function buildDailyRollup(input: {
  id: string;
  serviceKey: string;
  dateUtc: string;
  nowMs: number;
  presence: ServicePresence;
  incidents: readonly IncidentIntervalInput[];
  maintenances: readonly MaintenanceIntervalInput[];
  updatedAt?: Date;
}): DailyReliabilityRollup {
  const serviceIncidents = input.incidents
    .filter((item) => item.serviceKey === input.serviceKey)
    .map((item) => ({
      startsAtMs: item.openedAtMs,
      endsAtMs: item.resolvedAtMs ?? input.nowMs,
    }));
  const serviceMaintenances = input.maintenances
    .filter((item) => item.serviceKey === input.serviceKey && !item.cancelled)
    .map((item) => ({
      startsAtMs: item.startsAtMs,
      endsAtMs: item.endsAtMs,
    }));

  const buckets = accountDayBuckets({
    dateUtc: input.dateUtc,
    nowMs: input.nowMs,
    observableFromMs: input.presence.observableFromMs,
    incidents: serviceIncidents,
    maintenances: serviceMaintenances,
  });

  const sum =
    buckets.availableSeconds +
    buckets.degradedSeconds +
    buckets.unavailableSeconds +
    buckets.maintenanceSeconds +
    buckets.unknownSeconds;
  if (sum > buckets.observedSeconds) {
    throw new Error(
      `RELIABILITY_BUCKET_OVERFLOW:${input.serviceKey}:${input.dateUtc}:${sum}/${buckets.observedSeconds}`,
    );
  }

  return {
    id: input.id,
    serviceKey: input.serviceKey,
    dateUtc: input.dateUtc,
    ...buckets,
    incidentCount: countIncidentsTouchingDay(input.dateUtc, input.incidents, input.serviceKey),
    updatedAt: input.updatedAt ?? new Date(input.nowMs),
  };
}

export function buildHourlyRollup(input: {
  id: string;
  serviceKey: string;
  hourUtc: string;
  nowMs: number;
  presence: ServicePresence;
  incidents: readonly IncidentIntervalInput[];
  maintenances: readonly MaintenanceIntervalInput[];
  updatedAt?: Date;
}): HourlyReliabilityRollup {
  const serviceIncidents = input.incidents
    .filter((item) => item.serviceKey === input.serviceKey)
    .map((item) => ({
      startsAtMs: item.openedAtMs,
      endsAtMs: item.resolvedAtMs ?? input.nowMs,
    }));
  const serviceMaintenances = input.maintenances
    .filter((item) => item.serviceKey === input.serviceKey && !item.cancelled)
    .map((item) => ({
      startsAtMs: item.startsAtMs,
      endsAtMs: item.endsAtMs,
    }));

  const buckets = accountHourBuckets({
    hourUtc: input.hourUtc,
    nowMs: input.nowMs,
    observableFromMs: input.presence.observableFromMs,
    incidents: serviceIncidents,
    maintenances: serviceMaintenances,
  });

  const sum =
    buckets.availableSeconds +
    buckets.degradedSeconds +
    buckets.unavailableSeconds +
    buckets.maintenanceSeconds +
    buckets.unknownSeconds;
  if (sum > buckets.observedSeconds) {
    throw new Error(
      `RELIABILITY_BUCKET_OVERFLOW:${input.serviceKey}:${input.hourUtc}:${sum}/${buckets.observedSeconds}`,
    );
  }

  return {
    id: input.id,
    serviceKey: input.serviceKey,
    hourUtc: input.hourUtc,
    ...buckets,
    incidentCount: countIncidentsTouchingHour(input.hourUtc, input.incidents, input.serviceKey),
    updatedAt: input.updatedAt ?? new Date(input.nowMs),
  };
}

type RollupInvariantFields = {
  serviceKey: string;
  observedSeconds: number;
  availableSeconds: number;
  degradedSeconds: number;
  unavailableSeconds: number;
  maintenanceSeconds: number;
  unknownSeconds: number;
  incidentCount: number;
  dateUtc?: string;
  hourUtc?: string;
};

export function assertRollupInvariants(rollup: RollupInvariantFields): void {
  const label = rollup.dateUtc ?? rollup.hourUtc ?? "?";
  const fields = [
    rollup.observedSeconds,
    rollup.availableSeconds,
    rollup.degradedSeconds,
    rollup.unavailableSeconds,
    rollup.maintenanceSeconds,
    rollup.unknownSeconds,
    rollup.incidentCount,
  ];
  for (const value of fields) {
    if (!Number.isInteger(value) || value < 0) {
      throw new Error(`RELIABILITY_NEGATIVE_OR_FLOAT:${rollup.serviceKey}:${label}`);
    }
  }
  const sum =
    rollup.availableSeconds +
    rollup.degradedSeconds +
    rollup.unavailableSeconds +
    rollup.maintenanceSeconds +
    rollup.unknownSeconds;
  if (sum > rollup.observedSeconds) {
    throw new Error(`RELIABILITY_BUCKET_OVERFLOW:${rollup.serviceKey}:${label}`);
  }
}

export type SegmentPaint = Segment;
