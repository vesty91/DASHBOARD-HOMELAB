import type { IntegrationActor } from "@dashboard/integrations";

export type RadarrActor = IntegrationActor;

export type RadarrHttpMethod = "GET";

export type RadarrSectionStatus = "available" | "degraded" | "unavailable";

export type RadarrSectionReason =
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

export type RadarrOverviewStatus = "available" | "degraded";

export interface RadarrPermissionsView {
  readonly canRead: boolean;
  readonly canManage: boolean;
}

export interface RadarrIntegrationMetadata {
  readonly id: string;
  readonly name: string;
  readonly enabled: boolean;
}

export interface RadarrSystemStatusDto {
  readonly version: string | null;
  readonly appName?: string;
}

export interface RadarrHealthDto {
  readonly error: number;
  readonly warning: number;
  readonly notice: number;
  readonly other: number;
}

export interface RadarrQueueStatusDto {
  readonly totalCount?: number;
  readonly count?: number;
  readonly unknownCount?: number;
}

export interface RadarrMovieDto {
  readonly count: number;
  readonly truncated: boolean;
}

export interface RadarrDiskSpaceDto {
  readonly freeBytes: number;
  readonly totalBytes: number;
}

export interface RadarrSection<T> {
  readonly status: RadarrSectionStatus;
  readonly data: T | null;
  readonly reason?: RadarrSectionReason;
}

export interface RadarrOverview {
  readonly status: RadarrOverviewStatus;
  readonly fetchedAt: string;
  readonly system: RadarrSection<RadarrSystemStatusDto>;
  readonly health: RadarrSection<RadarrHealthDto>;
  readonly queue: RadarrSection<RadarrQueueStatusDto>;
  readonly movie: RadarrSection<RadarrMovieDto>;
  readonly diskSpace: RadarrSection<RadarrDiskSpaceDto>;
}
