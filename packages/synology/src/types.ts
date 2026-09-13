import type { IntegrationActor } from "@dashboard/integrations";

export type SynologyActor = IntegrationActor;

export type SynologySectionStatus = "available" | "degraded" | "unavailable";

export type SynologySectionReason =
  | "api-unavailable"
  | "permission-denied"
  | "timeout"
  | "invalid-response"
  | "unsupported-version"
  | "unknown";

export type SynologyOverviewStatus = "available" | "degraded";

export interface SynologySystemDto {
  readonly model: string | null;
  readonly dsmVersion: string | null;
  readonly uptimeSeconds: number | null;
  readonly systemTemperatureC: number | null;
  readonly temperatureWarning: boolean | null;
  readonly ramTotalBytes: number | null;
  readonly cpuCores: number | null;
  readonly cpuFamily: string | null;
  readonly cpuSeries: string | null;
}

export interface SynologyResourcesDto {
  readonly cpuTotalPercent: number | null;
  readonly cpuUserPercent: number | null;
  readonly cpuSystemPercent: number | null;
  readonly cpuOtherPercent: number | null;
  readonly memoryTotalBytes: number | null;
  readonly memoryAvailableBytes: number | null;
  readonly memoryUsedBytes: number | null;
  readonly memoryPercentUsed: number | null;
  readonly swapTotalBytes: number | null;
  readonly swapUsedPercent: number | null;
}

export interface SynologyVolumeDto {
  readonly id: string;
  readonly name: string;
  readonly filesystem: string | null;
  readonly raidType: string | null;
  readonly status: string;
  readonly totalBytes: number | null;
  readonly usedBytes: number | null;
  readonly freeBytes: number | null;
  readonly usedPercent: number | null;
  readonly temperatureC: number | null;
}

export interface SynologyDiskDto {
  readonly id: string;
  readonly displayName: string;
  readonly vendor: string | null;
  readonly model: string | null;
  readonly type: string | null;
  readonly status: string;
  readonly smartStatus: string | null;
  readonly temperatureC: number | null;
  readonly sizeBytes: number | null;
  readonly badSectorWarning: boolean | null;
  readonly remainingLifeWarning: boolean | null;
}

export interface SynologyStorageDto {
  readonly volumes: readonly SynologyVolumeDto[];
  readonly disks: readonly SynologyDiskDto[];
}

export interface SynologySection<T> {
  readonly status: SynologySectionStatus;
  readonly data: T | null;
  readonly reason?: SynologySectionReason;
}

export interface SynologyOverview {
  readonly status: SynologyOverviewStatus;
  readonly system: SynologySection<SynologySystemDto>;
  readonly resources: SynologySection<SynologyResourcesDto>;
  readonly storage: SynologySection<SynologyStorageDto>;
  readonly fetchedAt: string;
}

export interface SynologyIntegrationMetadata {
  readonly id: string;
  readonly name: string;
  readonly enabled: boolean;
}

export interface SynologyPermissionsView {
  readonly canRead: boolean;
  readonly canManageAuth: boolean;
}

export type SynologyHttpMethod = "GET" | "POST";
