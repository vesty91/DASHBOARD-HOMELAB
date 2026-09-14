import type { IntegrationActor } from "@dashboard/integrations";

export type ProxmoxActor = IntegrationActor;

export type ProxmoxHttpMethod = "GET";

export type ProxmoxNodeStatus = "online" | "offline" | "unknown";

export type ProxmoxSectionStatus = "available" | "degraded" | "unavailable";

export type ProxmoxSectionReason =
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

export type ProxmoxOverviewStatus = "available" | "degraded";

export interface ProxmoxPermissionsView {
  readonly canRead: boolean;
  readonly canManage: boolean;
}

export interface ProxmoxIntegrationMetadata {
  readonly id: string;
  readonly name: string;
  readonly enabled: boolean;
}

export interface ProxmoxVersionDto {
  readonly version: string | null;
  readonly release: string | null;
}

export interface ProxmoxClusterDto {
  readonly name: string | null;
  readonly quorate: boolean | null;
  readonly nodeCount: number;
  readonly onlineNodeCount: number;
}

export interface ProxmoxNodeDto {
  readonly id: string;
  readonly name: string;
  readonly status: ProxmoxNodeStatus;
  readonly cpuRatio: number | null;
  readonly memoryUsedBytes: number | null;
  readonly memoryTotalBytes: number | null;
  readonly uptimeSeconds: number | null;
}

export interface ProxmoxNodesDto {
  readonly nodes: readonly ProxmoxNodeDto[];
  readonly truncated: boolean;
}

export interface ProxmoxGuestsDto {
  readonly vmCount: number;
  readonly vmRunning: number;
  readonly lxcCount: number;
  readonly lxcRunning: number;
}

export interface ProxmoxStorageDto {
  readonly storageCount: number;
  readonly usedBytes: number | null;
  readonly totalBytes: number | null;
}

export interface ProxmoxSection<T> {
  readonly status: ProxmoxSectionStatus;
  readonly data: T | null;
  readonly reason?: ProxmoxSectionReason;
}

export interface ProxmoxOverview {
  readonly status: ProxmoxOverviewStatus;
  readonly fetchedAt: string;
  readonly version: ProxmoxSection<ProxmoxVersionDto>;
  readonly cluster: ProxmoxSection<ProxmoxClusterDto>;
  readonly nodes: ProxmoxSection<ProxmoxNodesDto>;
  readonly guests: ProxmoxSection<ProxmoxGuestsDto>;
  readonly storage: ProxmoxSection<ProxmoxStorageDto>;
}
