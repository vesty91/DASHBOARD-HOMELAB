import type { IntegrationActor } from "@dashboard/integrations";

export type BeszelActor = IntegrationActor;

export type BeszelHttpMethod = "GET" | "POST";

export type BeszelHostStatus = "up" | "down" | "paused" | "pending";

export type BeszelSectionStatus = "available" | "degraded" | "unavailable";

export type BeszelSectionReason =
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

export type BeszelOverviewStatus = "available" | "degraded";

export interface BeszelPermissionsView {
  readonly canRead: boolean;
  readonly canManage: boolean;
}

export interface BeszelIntegrationMetadata {
  readonly id: string;
  readonly name: string;
  readonly enabled: boolean;
}

export interface BeszelHostDto {
  readonly id: string;
  readonly name: string;
  readonly host: string | null;
  readonly status: BeszelHostStatus;
  readonly updatedAt: string | null;
  readonly cpuPercent: number | null;
  readonly memoryPercent: number | null;
  readonly diskPercent: number | null;
  readonly networkBytes: number | null;
  readonly agentVersion: string | null;
}

export interface BeszelHostsDto {
  readonly hosts: readonly BeszelHostDto[];
  readonly truncated: boolean;
  readonly hostCount: number;
  readonly upCount: number;
  readonly downCount: number;
  readonly pausedCount: number;
  readonly pendingCount: number;
}

export interface BeszelSection<T> {
  readonly status: BeszelSectionStatus;
  readonly data: T | null;
  readonly reason?: BeszelSectionReason;
}

export interface BeszelOverview {
  readonly status: BeszelOverviewStatus;
  readonly fetchedAt: string;
  readonly hosts: BeszelSection<BeszelHostsDto>;
}
