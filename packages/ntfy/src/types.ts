import type { IntegrationActor } from "@dashboard/integrations";

export type NtfyActor = IntegrationActor;

export type NtfyHttpMethod = "GET";

export type NtfySectionStatus = "available" | "degraded" | "unavailable";

export type NtfySectionReason =
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

export type NtfyOverviewStatus = "available" | "degraded";

export interface NtfyPermissionsView {
  readonly canRead: boolean;
  readonly canManage: boolean;
}

export interface NtfyIntegrationMetadata {
  readonly id: string;
  readonly name: string;
  readonly enabled: boolean;
}

export interface NtfyHealthDto {
  readonly healthy: boolean;
}

export interface NtfyStatsDto {
  readonly messages: number;
  readonly messagesRate: number;
}

export interface NtfyVersionDto {
  readonly version: string | null;
  readonly commit: string | null;
  readonly date: string | null;
}

export interface NtfySection<T> {
  readonly status: NtfySectionStatus;
  readonly data: T | null;
  readonly reason?: NtfySectionReason;
}

export interface NtfyOverview {
  readonly status: NtfyOverviewStatus;
  readonly fetchedAt: string;
  readonly health: NtfySection<NtfyHealthDto>;
  readonly stats: NtfySection<NtfyStatsDto>;
  readonly version: NtfySection<NtfyVersionDto>;
}
