import type { IntegrationActor } from "@dashboard/integrations";

export type GrafanaActor = IntegrationActor;

export type GrafanaHttpMethod = "GET";

export type GrafanaSectionStatus = "available" | "degraded" | "unavailable";

export type GrafanaSectionReason =
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

export type GrafanaOverviewStatus = "available" | "degraded";

export type GrafanaDatabaseStatus = "ok" | "failing";

export interface GrafanaPermissionsView {
  readonly canRead: boolean;
  readonly canManage: boolean;
}

export interface GrafanaIntegrationMetadata {
  readonly id: string;
  readonly name: string;
  readonly enabled: boolean;
}

export interface GrafanaHealthDto {
  readonly version: string | null;
  readonly database: GrafanaDatabaseStatus;
}

export interface GrafanaDashboardsDto {
  readonly count: number;
  readonly truncated: boolean;
}

export interface GrafanaFoldersDto {
  readonly count: number;
  readonly truncated: boolean;
}

export interface GrafanaAlertsDto {
  readonly firing: number;
  readonly pending: number;
  readonly inactive: number;
  readonly other: number;
}

export interface GrafanaDatasourceTypeTally {
  readonly type: string;
  readonly count: number;
}

export interface GrafanaDatasourcesDto {
  readonly count: number;
  readonly types: readonly GrafanaDatasourceTypeTally[];
}

export interface GrafanaSection<T> {
  readonly status: GrafanaSectionStatus;
  readonly data: T | null;
  readonly reason?: GrafanaSectionReason;
}

export interface GrafanaOverview {
  readonly status: GrafanaOverviewStatus;
  readonly fetchedAt: string;
  readonly health: GrafanaSection<GrafanaHealthDto>;
  readonly dashboards: GrafanaSection<GrafanaDashboardsDto>;
  readonly folders: GrafanaSection<GrafanaFoldersDto>;
  readonly alerts: GrafanaSection<GrafanaAlertsDto>;
  readonly datasources: GrafanaSection<GrafanaDatasourcesDto>;
}
