import type { IntegrationActor } from "@dashboard/integrations";

export type UptimeKumaActor = IntegrationActor;

export type UptimeKumaHttpMethod = "GET";

export type UptimeKumaMonitorStatus = "up" | "down" | "pending" | "maintenance";

export type UptimeKumaSectionStatus = "available" | "degraded" | "unavailable";

export type UptimeKumaSectionReason =
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

export type UptimeKumaOverviewStatus = "available" | "degraded";

export interface UptimeKumaPermissionsView {
  readonly canRead: boolean;
  readonly canManage: boolean;
}

export interface UptimeKumaIntegrationMetadata {
  readonly id: string;
  readonly name: string;
  readonly enabled: boolean;
}

export interface UptimeKumaMonitorDto {
  readonly id: string;
  readonly name: string;
  readonly status: UptimeKumaMonitorStatus;
  readonly latencyMs: number | null;
  readonly uptimePercent: number | null;
}

export interface UptimeKumaMonitorsDto {
  readonly monitors: readonly UptimeKumaMonitorDto[];
  readonly truncated: boolean;
  readonly monitorCount: number;
  readonly upCount: number;
  readonly downCount: number;
  readonly pendingCount: number;
  readonly maintenanceCount: number;
}

export interface UptimeKumaSection<T> {
  readonly status: UptimeKumaSectionStatus;
  readonly data: T | null;
  readonly reason?: UptimeKumaSectionReason;
}

export interface UptimeKumaOverview {
  readonly status: UptimeKumaOverviewStatus;
  readonly fetchedAt: string;
  readonly monitors: UptimeKumaSection<UptimeKumaMonitorsDto>;
}
