import type {
  DailyReliabilityRollup,
  IncidentIntervalInput,
  MaintenanceIntervalInput,
  ServicePresence,
  ServiceSlo,
} from "./types";

export type ReliabilityStorePort = {
  listIntegrationPresence(): Promise<ServicePresence[]>;
  integrationExists(serviceKey: string): Promise<boolean>;
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
  listSlos(input?: { serviceKeys?: readonly string[]; limit?: number }): Promise<ServiceSlo[]>;
  getSlo(id: string): Promise<ServiceSlo | null>;
  createSlo(input: {
    id: string;
    serviceKey: string;
    name: string;
    objectiveBasisPoints: number;
    windowDays: 7 | 30 | 90;
    excludeMaintenance: boolean;
    enabled: boolean;
    now: Date;
  }): Promise<ServiceSlo>;
  updateSlo(input: {
    id: string;
    expectedConfigRevision: number;
    name?: string;
    objectiveBasisPoints?: number;
    windowDays?: 7 | 30 | 90;
    excludeMaintenance?: boolean;
    enabled?: boolean;
    now: Date;
  }): Promise<ServiceSlo>;
  deleteSlo(id: string, expectedConfigRevision: number): Promise<void>;
};
