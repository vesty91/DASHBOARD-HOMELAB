import type { IntegrationActor } from "@dashboard/integrations";

export type JellyfinActor = IntegrationActor;

export type JellyfinHttpMethod = "GET";

export type JellyfinSectionStatus = "available" | "degraded" | "unavailable";

export type JellyfinSectionReason =
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

export type JellyfinOverviewStatus = "available" | "degraded";

export type JellyfinPlaybackMode = "direct-play" | "direct-stream" | "transcode";

export interface JellyfinPermissionsView {
  readonly canRead: boolean;
  readonly canManage: boolean;
}

export interface JellyfinIntegrationMetadata {
  readonly id: string;
  readonly name: string;
  readonly enabled: boolean;
}

export interface JellyfinServerDto {
  readonly serverName: string | null;
  readonly version: string | null;
  readonly productName: string | null;
  readonly operatingSystem: string | null;
  readonly startupWizardCompleted: boolean | null;
  readonly hasPendingRestart: boolean | null;
}

export interface JellyfinNowPlayingDto {
  readonly name: string | null;
  readonly type: string | null;
  readonly year: number | null;
}

export interface JellyfinTranscodingDto {
  readonly progressPercent: number | null;
  readonly bitrate: number | null;
}

export interface JellyfinSessionDto {
  readonly id: string;
  readonly userLabel: string;
  readonly client: string | null;
  readonly deviceName: string | null;
  readonly isActive: boolean | null;
  readonly paused: boolean | null;
  readonly nowPlaying: JellyfinNowPlayingDto | null;
  readonly playbackMode: JellyfinPlaybackMode | null;
  readonly transcoding: JellyfinTranscodingDto | null;
}

export interface JellyfinSessionsDto {
  readonly activeCount: number;
  readonly sessions: readonly JellyfinSessionDto[];
}

export interface JellyfinSection<T> {
  readonly status: JellyfinSectionStatus;
  readonly data: T | null;
  readonly reason?: JellyfinSectionReason;
}

export interface JellyfinOverview {
  readonly status: JellyfinOverviewStatus;
  readonly fetchedAt: string;
  readonly server: JellyfinSection<JellyfinServerDto>;
  readonly sessions: JellyfinSection<JellyfinSessionsDto>;
}
