import type {
  DailyReliabilityRollup,
  IncidentIntervalInput,
  MaintenanceIntervalInput,
  ServicePresence,
} from "./types";

export type ReliabilityStorePort = {
  listIntegrationPresence(): Promise<ServicePresence[]>;
  listIncidentsBetween(fromMs: number, toMs: number): Promise<IncidentIntervalInput[]>;
  listMaintenancesBetween(fromMs: number, toMs: number): Promise<MaintenanceIntervalInput[]>;
  upsertDaily(rows: readonly DailyReliabilityRollup[]): Promise<void>;
  listDaily(input: {
    serviceKeys: readonly string[];
    fromDateUtc: string;
    toDateUtc: string;
    limit: number;
  }): Promise<DailyReliabilityRollup[]>;
  deleteOlderThan(dateUtcExclusive: string): Promise<number>;
};
