export const RUNTIME_COMPONENT_STATUSES = ["disabled", "up", "down"] as const;
export type RuntimeComponentStatus = (typeof RUNTIME_COMPONENT_STATUSES)[number];

export interface RuntimeStatus {
  redis: RuntimeComponentStatus;
  worker: RuntimeComponentStatus;
  realtime: RuntimeComponentStatus;
}

export interface RuntimeProbe {
  pingRedis(): Promise<boolean>;
  probeHttp(url: string): Promise<boolean>;
}

export interface RuntimeStatusConfig {
  redisUrl?: string;
  workerUrl?: string;
  realtimeUrl?: string;
}

function healthUrl(base: string): string {
  return new URL("/health/ready", base).toString();
}

export function createRuntimeStatusService(config: RuntimeStatusConfig, probe: RuntimeProbe) {
  return {
    async getStatus(): Promise<RuntimeStatus> {
      const redis = config.redisUrl ? ((await probe.pingRedis()) ? "up" : "down") : "disabled";
      const worker = config.workerUrl
        ? (await probe.probeHttp(healthUrl(config.workerUrl)))
          ? "up"
          : "down"
        : "disabled";
      const realtime = config.realtimeUrl
        ? (await probe.probeHttp(healthUrl(config.realtimeUrl)))
          ? "up"
          : "down"
        : "disabled";
      return { redis, worker, realtime };
    },
  };
}

export type RuntimeStatusService = ReturnType<typeof createRuntimeStatusService>;
