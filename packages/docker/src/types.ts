import type { IntegrationActor } from "@dashboard/integrations";
import type { AppLifecycleStatus } from "@dashboard/app-library";

export type DockerActor = IntegrationActor;

export type DockerContainerState =
  "created" | "running" | "paused" | "restarting" | "removing" | "exited" | "dead" | "unknown";

export type DockerHealthStatus = "healthy" | "unhealthy" | "starting" | "none" | "unknown";

export interface DockerRecognizedApp {
  readonly id: string;
  readonly name: string;
  readonly iconPath: string;
  readonly lifecycleStatus: AppLifecycleStatus;
  readonly replacedBy: string | null;
  readonly replacedByName: string | null;
}

export interface DockerPortBinding {
  readonly privatePort: number;
  readonly publicPort: number | null;
  readonly protocol: "tcp" | "udp" | "unknown";
  readonly hostIp: string | null;
}

export interface DockerContainerSummary {
  readonly id: string;
  readonly shortId: string;
  readonly names: readonly string[];
  readonly image: string;
  readonly createdAt: string | null;
  readonly state: DockerContainerState;
  readonly statusText: string;
  readonly ports: readonly DockerPortBinding[];
  readonly health: DockerHealthStatus;
  readonly recognizedApp: DockerRecognizedApp | null;
}

export interface DockerContainerDetail {
  readonly id: string;
  readonly shortId: string;
  readonly name: string;
  readonly image: string;
  readonly state: DockerContainerState;
  readonly health: DockerHealthStatus;
  readonly startedAt: string | null;
  readonly finishedAt: string | null;
  readonly restartCount: number | null;
  readonly uptimeSeconds: number | null;
  readonly ports: readonly DockerPortBinding[];
  readonly recognizedApp: DockerRecognizedApp | null;
}

export interface DockerContainerStats {
  readonly cpuPercent: number | null;
  readonly memoryUsageBytes: number | null;
  readonly memoryLimitBytes: number | null;
  readonly memoryPercent: number | null;
  readonly networkRxBytes: number | null;
  readonly networkTxBytes: number | null;
  readonly blockReadBytes: number | null;
  readonly blockWriteBytes: number | null;
}

export interface DockerLogResult {
  readonly text: string;
  readonly tail: number;
  readonly truncated: boolean;
  readonly tty: boolean;
}

export interface DockerActionResult {
  readonly changed: boolean;
}

export interface DockerSystemInfo {
  readonly engineVersion: string;
  readonly serverApiVersion: string;
  readonly serverMinApiVersion: string | null;
  readonly negotiatedApiVersion: string;
  readonly os: string | null;
  readonly arch: string | null;
}

export interface DockerIntegrationMetadata {
  readonly id: string;
  readonly name: string;
  readonly enabled: boolean;
}

export interface DockerPermissionsView {
  readonly canRead: boolean;
  readonly canLogs: boolean;
  readonly canStart: boolean;
  readonly canStop: boolean;
  readonly canRestart: boolean;
  readonly canManage: boolean;
}

export type DockerHttpMethod = "GET" | "POST";
