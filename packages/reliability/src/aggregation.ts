import type {
  DailyReliabilityRollup,
  IncidentIntervalInput,
  MaintenanceIntervalInput,
  ReliabilityBucket,
  ServicePresence,
} from "./types";

export const RELIABILITY_RETENTION_DAYS = 730;
export const RELIABILITY_REBUILD_DEFAULT_DAYS = 7;
export const RELIABILITY_REBUILD_MAX_DAYS = 90;
export const MS_PER_DAY = 86_400_000;

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

export function utcDayStartMs(dateUtc: string): number {
  const parsed = Date.parse(`${dateUtc}T00:00:00.000Z`);
  if (Number.isNaN(parsed)) throw new Error(`INVALID_UTC_DATE:${dateUtc}`);
  return parsed;
}

export function utcDayEndMs(dateUtc: string): number {
  return utcDayStartMs(dateUtc) + MS_PER_DAY;
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

/**
 * Paint intervals onto a day window with mutual-exclusion precedence.
 * Baseline for an observable service is `available`; before observability is `unknown`.
 */
export function accountDayBuckets(input: {
  dateUtc: string;
  nowMs: number;
  observableFromMs: number;
  incidents: readonly { startsAtMs: number; endsAtMs: number }[];
  maintenances: readonly { startsAtMs: number; endsAtMs: number }[];
}): {
  observedSeconds: number;
  availableSeconds: number;
  degradedSeconds: number;
  unavailableSeconds: number;
  maintenanceSeconds: number;
  unknownSeconds: number;
} {
  const dayStart = utcDayStartMs(input.dateUtc);
  const dayEndExclusive = Math.min(utcDayEndMs(input.dateUtc), input.nowMs);
  if (dayEndExclusive <= dayStart) {
    return { observedSeconds: 0, ...emptyBuckets() };
  }

  const cuts = new Set<number>([dayStart, dayEndExclusive]);
  const observableStart = Math.max(dayStart, Math.min(dayEndExclusive, input.observableFromMs));
  cuts.add(observableStart);

  for (const interval of input.incidents) {
    const start = Math.max(dayStart, interval.startsAtMs);
    const end = Math.min(dayEndExclusive, interval.endsAtMs);
    if (end > start) {
      cuts.add(start);
      cuts.add(end);
    }
  }
  for (const interval of input.maintenances) {
    const start = Math.max(dayStart, interval.startsAtMs);
    const end = Math.min(dayEndExclusive, interval.endsAtMs);
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
    if (end <= start || start < dayStart || end > dayEndExclusive) continue;
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

export function assertRollupInvariants(rollup: DailyReliabilityRollup): void {
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
      throw new Error(`RELIABILITY_NEGATIVE_OR_FLOAT:${rollup.serviceKey}:${rollup.dateUtc}`);
    }
  }
  const sum =
    rollup.availableSeconds +
    rollup.degradedSeconds +
    rollup.unavailableSeconds +
    rollup.maintenanceSeconds +
    rollup.unknownSeconds;
  if (sum > rollup.observedSeconds) {
    throw new Error(`RELIABILITY_BUCKET_OVERFLOW:${rollup.serviceKey}:${rollup.dateUtc}`);
  }
}

export type SegmentPaint = Segment;
