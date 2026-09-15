import type { IntegrationActor } from "@dashboard/integrations";

export type QbittorrentActor = IntegrationActor;

export type QbittorrentHttpMethod = "GET" | "POST";

export type QbittorrentSectionStatus = "available" | "degraded" | "unavailable";

export type QbittorrentSectionReason =
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

export type QbittorrentOverviewStatus = "available" | "degraded";

export type QbittorrentConnectionStatus = "connected" | "firewalled" | "disconnected";

export type QbittorrentTorrentBucket =
  "downloading" | "uploading" | "stalled" | "queued" | "paused" | "other";

export interface QbittorrentPermissionsView {
  readonly canRead: boolean;
  readonly canManage: boolean;
  readonly canPause: boolean;
  readonly canResume: boolean;
}

export interface QbittorrentIntegrationMetadata {
  readonly id: string;
  readonly name: string;
  readonly enabled: boolean;
}

export interface QbittorrentVersionDto {
  readonly version: string | null;
}

export interface QbittorrentTransferDto {
  readonly downloadSpeedBps: number;
  readonly uploadSpeedBps: number;
  readonly connectionStatus?: QbittorrentConnectionStatus;
}

export interface QbittorrentTorrentsDto {
  readonly downloading: number;
  readonly uploading: number;
  readonly stalled: number;
  readonly queued: number;
  readonly paused: number;
  readonly other: number;
}

export interface QbittorrentSection<T> {
  readonly status: QbittorrentSectionStatus;
  readonly data: T | null;
  readonly reason?: QbittorrentSectionReason;
}

export interface QbittorrentOverview {
  readonly status: QbittorrentOverviewStatus;
  readonly fetchedAt: string;
  readonly version: QbittorrentSection<QbittorrentVersionDto>;
  readonly transfer: QbittorrentSection<QbittorrentTransferDto>;
  readonly torrents: QbittorrentSection<QbittorrentTorrentsDto>;
}
