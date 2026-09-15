import type { IntegrationActor } from "@dashboard/integrations";

export type SonarrActor = IntegrationActor;

export type SonarrHttpMethod = "GET" | "POST";

export type SonarrSectionStatus = "available" | "degraded" | "unavailable";

export type SonarrSectionReason =
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

export type SonarrOverviewStatus = "available" | "degraded";

export interface SonarrPermissionsView {
  readonly canRead: boolean;
  readonly canManage: boolean;
  readonly canCommand: boolean;
}

export interface SonarrIntegrationMetadata {
  readonly id: string;
  readonly name: string;
  readonly enabled: boolean;
}

export interface SonarrSystemStatusDto {
  readonly version: string | null;
  readonly appName?: string;
}

export interface SonarrHealthDto {
  readonly error: number;
  readonly warning: number;
  readonly notice: number;
  readonly other: number;
}

export interface SonarrQueueStatusDto {
  readonly totalCount?: number;
  readonly count?: number;
  readonly unknownCount?: number;
  readonly errors?: number;
  readonly warnings?: number;
}

export interface SonarrSeriesDto {
  readonly count: number;
  readonly truncated: boolean;
}

export interface SonarrDiskSpaceDto {
  readonly freeBytes: number;
  readonly totalBytes: number;
}

export interface SonarrSection<T> {
  readonly status: SonarrSectionStatus;
  readonly data: T | null;
  readonly reason?: SonarrSectionReason;
}

export interface SonarrOverview {
  readonly status: SonarrOverviewStatus;
  readonly fetchedAt: string;
  readonly system: SonarrSection<SonarrSystemStatusDto>;
  readonly health: SonarrSection<SonarrHealthDto>;
  readonly queue: SonarrSection<SonarrQueueStatusDto>;
  readonly series: SonarrSection<SonarrSeriesDto>;
  readonly diskSpace: SonarrSection<SonarrDiskSpaceDto>;
}
