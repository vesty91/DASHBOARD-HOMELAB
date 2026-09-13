import type { IntegrationActor } from "@dashboard/integrations";

export type ImmichActor = IntegrationActor;

export type ImmichHttpMethod = "GET";

export type ImmichSectionStatus = "available" | "degraded" | "unavailable";

export type ImmichSectionReason =
  | "api-unavailable"
  | "permission-denied"
  | "timeout"
  | "invalid-response"
  | "unauthorized"
  | "rate-limited"
  | "dns"
  | "tls"
  | "unreachable"
  | "unknown";

export type ImmichOverviewStatus = "available" | "degraded";

export interface ImmichPermissionsView {
  readonly canRead: boolean;
  readonly canManage: boolean;
}

export interface ImmichIntegrationMetadata {
  readonly id: string;
  readonly name: string;
  readonly enabled: boolean;
}

export interface ImmichServerDto {
  readonly version: string | null;
  readonly licensed: boolean | null;
}

export interface ImmichHealthDto {
  readonly ok: boolean;
}

export interface ImmichStorageDto {
  readonly diskSizeBytes: number | null;
  readonly diskUseBytes: number | null;
  readonly diskAvailableBytes: number | null;
  readonly diskUsagePercent: number | null;
}

export interface ImmichStatsDto {
  readonly photos: number | null;
  readonly videos: number | null;
  readonly usageBytes: number | null;
}

export interface ImmichSection<T> {
  readonly status: ImmichSectionStatus;
  readonly data: T | null;
  readonly reason?: ImmichSectionReason;
}

export interface ImmichOverview {
  readonly status: ImmichOverviewStatus;
  readonly fetchedAt: string;
  readonly server: ImmichSection<ImmichServerDto>;
  readonly health: ImmichSection<ImmichHealthDto>;
  readonly storage: ImmichSection<ImmichStorageDto>;
  readonly stats: ImmichSection<ImmichStatsDto>;
}
