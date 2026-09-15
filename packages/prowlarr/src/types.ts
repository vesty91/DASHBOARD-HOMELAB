import type { IntegrationActor } from "@dashboard/integrations";

export type ProwlarrActor = IntegrationActor;

export type ProwlarrHttpMethod = "GET";

export type ProwlarrSectionStatus = "available" | "degraded" | "unavailable";

export type ProwlarrSectionReason =
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

export type ProwlarrOverviewStatus = "available" | "degraded";

export interface ProwlarrPermissionsView {
  readonly canRead: boolean;
  readonly canManage: boolean;
}

export interface ProwlarrIntegrationMetadata {
  readonly id: string;
  readonly name: string;
  readonly enabled: boolean;
}

export interface ProwlarrSystemStatusDto {
  readonly version: string | null;
  readonly appName?: string;
}

export interface ProwlarrHealthDto {
  error: number;
  warning: number;
  notice: number;
  other: number;
}

export interface ProwlarrIndexerDto {
  readonly count: number;
  readonly enabledCount: number;
}

export interface ProwlarrIndexerStatusDto {
  readonly count: number;
}

export interface ProwlarrSection<T> {
  readonly status: ProwlarrSectionStatus;
  readonly data: T | null;
  readonly reason?: ProwlarrSectionReason;
}

export interface ProwlarrOverview {
  readonly status: ProwlarrOverviewStatus;
  readonly fetchedAt: string;
  readonly system: ProwlarrSection<ProwlarrSystemStatusDto>;
  readonly health: ProwlarrSection<ProwlarrHealthDto>;
  readonly indexer: ProwlarrSection<ProwlarrIndexerDto>;
  readonly indexerStatus: ProwlarrSection<ProwlarrIndexerStatusDto>;
}
