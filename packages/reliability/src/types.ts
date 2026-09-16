export type ReliabilityBucket =
  "maintenance" | "unavailable" | "degraded" | "available" | "unknown";

export type DailyReliabilityRollup = {
  id: string;
  serviceKey: string;
  dateUtc: string;
  observedSeconds: number;
  availableSeconds: number;
  degradedSeconds: number;
  unavailableSeconds: number;
  maintenanceSeconds: number;
  unknownSeconds: number;
  incidentCount: number;
  updatedAt: Date;
};

export type ReliabilityInterval = {
  startsAtMs: number;
  endsAtMs: number;
  bucket: ReliabilityBucket;
};

export type IncidentIntervalInput = {
  id: string;
  serviceKey: string;
  openedAtMs: number;
  resolvedAtMs: number | null;
};

export type MaintenanceIntervalInput = {
  id: string;
  serviceKey: string;
  startsAtMs: number;
  endsAtMs: number;
  cancelled: boolean;
};

export type ServicePresence = {
  serviceKey: string;
  /** Instant from which the service is considered observable. */
  observableFromMs: number;
};

export type ServiceSlo = {
  id: string;
  serviceKey: string;
  name: string;
  objectiveBasisPoints: number;
  windowDays: 7 | 30 | 90;
  excludeMaintenance: boolean;
  enabled: boolean;
  configRevision: number;
  createdAt: Date;
  updatedAt: Date;
};

export type ReliabilityServiceSummary = {
  serviceKey: string;
  days: DailyReliabilityRollup[];
  slo: ServiceSlo | null;
  availabilityBasisPoints: number | null;
  sloMet: boolean | null;
  remainingBudgetBasisPoints: number | null;
};
